import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Shorts, TemplateId, Tone } from '../types';
import { buildLocalShorts } from '../lib/localEngine';
import { TEMPLATE_MAP, TEMPLATES } from '../lib/templates';
import { NOTE } from '../lib/messages';
import { probeGenerateServer, requestAiShorts, type ServerState } from '../lib/ai';
import { loadShorts, saveShorts } from '../lib/storage';
import { normalizeMarks } from '../lib/text';
import { newSeed } from '../lib/motion/rng';
import type { MotionLevel } from '../lib/motion/stage';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'warn' | 'error';
}

const SAMPLE = { topic: '월급 1.5배 vs 칼퇴', template: 'balance' as TemplateId, tone: 'cider' as Tone };
const MOTION_KEY = 'shortcut-studio:motion:v1';
const MOTION_IDS: MotionLevel[] = ['calm', 'vivid', 'boom'];

function loadMotion(): MotionLevel {
  try {
    const raw = localStorage.getItem(MOTION_KEY);
    if (raw && MOTION_IDS.includes(raw as MotionLevel)) return raw as MotionLevel;
  } catch {
    /* 저장소를 쓸 수 없는 브라우저 */
  }
  // 움직임을 줄여 달라고 한 기기(접근성 설정)에서는 처음부터 차분하게.
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'calm';
  } catch {
    /* matchMedia 없음 */
  }
  return 'vivid';
}

export function useShorts() {
  const initial = useMemo(() => loadShorts(), []);
  const [topic, setTopic] = useState(initial?.topic ?? SAMPLE.topic);
  const [template, setTemplate] = useState<TemplateId>(initial?.template ?? SAMPLE.template);
  const [tone, setTone] = useState<Tone>(initial?.tone ?? SAMPLE.tone);
  const [shorts, setShorts] = useState<Shorts>(() => initial ?? buildLocalShorts(SAMPLE));
  const [server, setServer] = useState<ServerState>({ state: 'checking' });
  const [generating, setGenerating] = useState(false);
  const [playNonce, setPlayNonce] = useState(0);
  const [motion, setMotionState] = useState<MotionLevel>(() => loadMotion());
  const [seekRequest, setSeekRequest] = useState<{ index: number; nonce: number } | null>(null);
  const [saved, setSaved] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);
  const seekSeq = useRef(0);
  const busy = useRef(false);

  const setMotion = useCallback((level: MotionLevel) => {
    setMotionState(level);
    try {
      localStorage.setItem(MOTION_KEY, level);
    } catch {
      /* 저장소를 쓸 수 없는 브라우저 */
    }
  }, []);

  const notify = useCallback((message: string, tone2: Toast['tone'] = 'info') => {
    toastSeq.current += 1;
    const id = toastSeq.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone: tone2 }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 3600);
  }, []);

  useEffect(() => {
    let alive = true;
    void probeGenerateServer().then((state) => {
      if (alive) setServer(state);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setSaved(false);
    const timer = window.setTimeout(() => setSaved(saveShorts(shorts)), 500);
    return () => window.clearTimeout(timer);
  }, [shorts]);

  const apply = useCallback((next: Shorts) => {
    // 새로 만들 때마다 시드가 바뀌어 장면·색·카메라가 전부 달라집니다.
    setShorts(next.seed ? next : { ...next, seed: newSeed() });
    setTopic(next.topic);
    setTemplate(next.template);
    setTone(next.tone);
    setPlayNonce((value) => value + 1);
  }, []);

  const generate = useCallback(async () => {
    if (busy.current) return;
    const trimmed = topic.trim();
    if (trimmed.length < 2) {
      notify('주제를 한 줄만 적어 주세요. 예: 월급 1.5배 vs 칼퇴', 'warn');
      return;
    }
    busy.current = true;
    setGenerating(true);
    try {
      let next: Shorts | null = null;
      if (server.state === 'ai') {
        try {
          next = await requestAiShorts({ topic: trimmed, template, tone });
        } catch (error) {
          notify(`AI 대본을 못 받아 내장 엔진으로 만들었어요. ${error instanceof Error ? error.message : ''}`.trim(), 'warn');
        }
      }
      if (!next) {
        const local = buildLocalShorts({ topic: trimmed, template, tone });
        next = local;
        if (server.state === 'local' && server.reason === 'no_key') notify(NOTE.noKey, 'info');
      }
      apply(next);
      if (next.source === 'ai') notify('AI가 쓴 6컷 대본이 도착했어요. 바로 재생됩니다.');
    } finally {
      busy.current = false;
      setGenerating(false);
    }
  }, [apply, notify, server, template, tone, topic]);

  const updateCut = useCallback((id: string, subtitle: string) => {
    setShorts((prev) => ({
      ...prev,
      cuts: prev.cuts.map((cut) => (cut.id === id ? { ...cut, subtitle } : cut)),
      updatedAt: Date.now(),
    }));
  }, []);

  /** 입력을 마치면 짝이 안 맞는 별표를 정리합니다(타이핑 중에는 그대로 둡니다). */
  const normalizeCut = useCallback((id: string) => {
    setShorts((prev) => ({
      ...prev,
      cuts: prev.cuts.map((cut) => (cut.id === id ? { ...cut, subtitle: normalizeMarks(cut.subtitle) } : cut)),
      updatedAt: Date.now(),
    }));
  }, []);

  const moveCut = useCallback((id: string, direction: -1 | 1) => {
    setShorts((prev) => {
      const index = prev.cuts.findIndex((cut) => cut.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.cuts.length) return prev;
      const cuts = [...prev.cuts];
      const [moved] = cuts.splice(index, 1);
      if (!moved) return prev;
      cuts.splice(target, 0, moved);
      return { ...prev, cuts, updatedAt: Date.now() };
    });
  }, []);

  const jumpTo = useCallback((index: number) => {
    seekSeq.current += 1;
    setSeekRequest({ index, nonce: seekSeq.current });
  }, []);

  const selectTemplate = useCallback((id: TemplateId) => {
    setTemplate(id);
    // 직접 쓴 주제는 지우지 않습니다. 비어 있거나 다른 템플릿의 추천 주제일 때만 채웁니다.
    setTopic((prev) => {
      const trimmed = prev.trim();
      const isSuggestion = TEMPLATES.some((item) => item.topics.includes(trimmed));
      if (!trimmed || isSuggestion) return TEMPLATE_MAP[id].topics[0] ?? '';
      return prev;
    });
  }, []);

  const totalSeconds = useMemo(() => shorts.cuts.reduce((sum, cut) => sum + cut.duration, 0), [shorts.cuts]);

  return {
    topic,
    setTopic,
    template,
    tone,
    setTone,
    selectTemplate,
    shorts,
    totalSeconds,
    motion,
    setMotion,
    server,
    generating,
    generate,
    updateCut,
    normalizeCut,
    moveCut,
    jumpTo,
    playNonce,
    seekRequest,
    toasts,
    notify,
    saved,
  };
}

export type Studio = ReturnType<typeof useShorts>;
