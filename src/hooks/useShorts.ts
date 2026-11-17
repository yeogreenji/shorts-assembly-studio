import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Shorts, TemplateId, Tone } from '../types';
import { buildLocalShorts } from '../lib/localEngine';
import { TEMPLATE_MAP, TEMPLATES } from '../lib/templates';
import { NOTE } from '../lib/messages';
import { probeGenerateServer, requestAiShorts, type ServerState } from '../lib/ai';
import { loadShorts, saveShorts } from '../lib/storage';
import { normalizeMarks } from '../lib/text';
import { newSeed } from '../lib/scenes';
import { loadArt, probeImageServer, requestCutImage, saveArt } from '../lib/images';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'warn' | 'error';
}

const SAMPLE = { topic: '월급 1.5배 vs 칼퇴', template: 'balance' as TemplateId, tone: 'cider' as Tone };

export function useShorts() {
  const initial = useMemo(() => loadShorts(), []);
  const [topic, setTopic] = useState(initial?.topic ?? SAMPLE.topic);
  const [template, setTemplate] = useState<TemplateId>(initial?.template ?? SAMPLE.template);
  const [tone, setTone] = useState<Tone>(initial?.tone ?? SAMPLE.tone);
  const [shorts, setShorts] = useState<Shorts>(() => initial ?? buildLocalShorts(SAMPLE));
  const [server, setServer] = useState<ServerState>({ state: 'checking' });
  const [generating, setGenerating] = useState(false);
  const [playNonce, setPlayNonce] = useState(0);
  const [seekRequest, setSeekRequest] = useState<{ index: number; nonce: number } | null>(null);
  const [saved, setSaved] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastSeq = useRef(0);
  const seekSeq = useRef(0);
  const busy = useRef(false);
  const [imageReady, setImageReady] = useState(false);
  const [art, setArt] = useState<Record<string, string>>({});
  const [artLoading, setArtLoading] = useState<string[]>([]);
  const artRef = useRef<Record<string, string>>({});
  const imageReadyRef = useRef(false);
  const shortsRef = useRef<Shorts | null>(null);

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
    let alive = true;
    void probeImageServer().then((ok) => {
      if (!alive) return;
      imageReadyRef.current = ok;
      setImageReady(ok);
    });
    void loadArt(shorts.cuts.map((cut) => cut.id)).then((blobs) => {
      if (!alive) return;
      const urls: Record<string, string> = {};
      for (const [id, blob] of Object.entries(blobs)) urls[id] = URL.createObjectURL(blob);
      artRef.current = { ...urls, ...artRef.current };
      setArt(artRef.current);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    shortsRef.current = shorts;
  }, [shorts]);

  /** 컷 그림을 만듭니다(동시 2장). 실패한 컷은 내장 일러스트가 그대로 보입니다. */
  const paintCuts = useCallback(
    async (target: Shorts, ids?: string[], variantHint = false) => {
      const jobs = target.cuts.filter((cut) => cut.scene && (!ids || ids.includes(cut.id)));
      if (!jobs.length) return;
      setArtLoading((prev) => [...new Set([...prev, ...jobs.map((cut) => cut.id)])]);
      let failures = 0;
      let lastError = '';
      const queue = [...jobs];
      const worker = async () => {
        for (let cut = queue.shift(); cut; cut = queue.shift()) {
          try {
            const hint = variantHint && (cut.variant ?? 0) > 0 ? ` Alternative composition, variation ${cut.variant}.` : '';
            const blob = await requestCutImage(`${cut.scene ?? ''}${hint}`, target.character ?? '');
            void saveArt(cut.id, blob);
            const url = URL.createObjectURL(blob);
            const old = artRef.current[cut.id];
            artRef.current = { ...artRef.current, [cut.id]: url };
            if (old) URL.revokeObjectURL(old);
            setArt(artRef.current);
          } catch (error) {
            failures += 1;
            lastError = error instanceof Error ? error.message : '';
          } finally {
            setArtLoading((prev) => prev.filter((id) => id !== cut.id));
          }
        }
      };
      await Promise.all([worker(), worker()]);
      if (failures) notify(`컷 그림 ${failures}장을 못 만들어 내장 일러스트로 보여 줘요. ${lastError}`.trim(), 'warn');
    },
    [notify],
  );

  useEffect(() => {
    setSaved(false);
    const timer = window.setTimeout(() => setSaved(saveShorts(shorts)), 500);
    return () => window.clearTimeout(timer);
  }, [shorts]);

  const apply = useCallback((next: Shorts) => {
    setShorts(next);
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
      if (next.source === 'ai') {
        notify(
          imageReadyRef.current && next.cuts.some((cut) => cut.scene)
            ? 'AI 대본이 도착했어요. 컷 그림을 그리는 중이라 잠시 뒤 바뀝니다.'
            : 'AI가 쓴 6컷 대본이 도착했어요. 바로 재생됩니다.',
        );
        if (imageReadyRef.current) void paintCuts(next);
      }
    } finally {
      busy.current = false;
      setGenerating(false);
    }
  }, [apply, notify, paintCuts, server, template, tone, topic]);

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

  /** 이 컷의 배경 일러스트를 다른 것으로 다시 뽑습니다. */
  const rerollScene = useCallback(
    (id: string) => {
      const current = shortsRef.current;
      const next = current
        ? { ...current, cuts: current.cuts.map((cut) => (cut.id === id ? { ...cut, variant: (cut.variant ?? 0) + 1 } : cut)) }
        : null;
      setShorts((prev) => ({
        ...prev,
        cuts: prev.cuts.map((cut) => (cut.id === id ? { ...cut, variant: (cut.variant ?? 0) + 1 } : cut)),
        updatedAt: Date.now(),
      }));
      if (next && imageReadyRef.current) void paintCuts(next, [id], true);
    },
    [paintCuts],
  );

  /** 모든 컷의 배경을 새로 그립니다. */
  const rerollAll = useCallback(() => {
    const current = shortsRef.current;
    setShorts((prev) => ({
      ...prev,
      seed: newSeed(),
      cuts: prev.cuts.map((cut) => ({ ...cut, variant: (cut.variant ?? 0) + 1 })),
      updatedAt: Date.now(),
    }));
    if (current && imageReadyRef.current) {
      void paintCuts({ ...current, cuts: current.cuts.map((cut) => ({ ...cut, variant: (cut.variant ?? 0) + 1 })) }, undefined, true);
    }
  }, [paintCuts]);

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
    server,
    generating,
    generate,
    updateCut,
    normalizeCut,
    moveCut,
    rerollScene,
    rerollAll,
    art,
    artLoading,
    imageReady,
    jumpTo,
    playNonce,
    seekRequest,
    toasts,
    notify,
    saved,
  };
}

export type Studio = ReturnType<typeof useShorts>;
