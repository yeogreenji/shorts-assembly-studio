import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AudioSettings, BrandSettings, CaptionStyle, Shorts, ShotImage, TemplateId, Tone } from '../types';
import { buildLocalShorts } from '../lib/localEngine';
import { MAX_CUT_SECONDS, MIN_CUT_SECONDS, TEMPLATE_MAP, TEMPLATES } from '../lib/templates';
import { NOTE } from '../lib/messages';
import { probeGenerateServer, requestAiShorts, type ServerState } from '../lib/ai';
import { loadShorts, saveShorts } from '../lib/storage';
import { normalizeMarks } from '../lib/text';
import { newSeed } from '../lib/motion/rng';
import type { MotionLevel } from '../lib/motion/stage';
import { BGM_BY_TEMPLATE, audioOf, brandOf, styleOf } from '../lib/defaults';
import { buildPresetShorts, PRESET_MAP } from '../lib/presets';
import { deleteProject, listProjects, loadProject, saveProject, type ProjectMeta } from '../lib/projects';
import { addSceneImage } from '../lib/customArt';
import { getPlan, limitsOf } from '../lib/plan';

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
  const [projects, setProjects] = useState<ProjectMeta[]>(() => listProjects());
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
    window.setTimeout(() => setToasts((prev) => prev.filter((toast) => toast.id !== id)), 3800);
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

  const apply = useCallback((next: Shorts, mode: 'generate' | 'source' = 'generate') => {
    // 새 대본을 만들 때는 사용자가 맞춰 둔 브랜드·자막 테마·볼륨을 그대로 두고,
    // 프리셋·드래프트를 열 때는 그 프로젝트의 설정을 그대로 살립니다.
    setShorts((prev) => {
      const base = next.seed ? next : { ...next, seed: newSeed() };
      return {
        ...base,
        audio: {
          ...base.audio,
          volume: prev.audio.volume,
          muted: prev.audio.muted,
          accents: prev.audio.accents,
          narration: prev.audio.narration,
        },
        style: mode === 'source' ? base.style : prev.style,
        brand: prev.brand,
      };
    });
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
          const detail = error instanceof Error ? error.message : '';
          const rateLimited = /429|quota|rate/i.test(detail);
          notify(
            rateLimited
              ? 'AI가 잠시 붐빕니다(429). 내장 엔진으로 같은 주제의 6컷을 만들었어요.'
              : `AI 대본을 못 받아 내장 엔진으로 만들었어요. ${detail}`.trim(),
            'warn',
          );
        }
      }
      if (!next) {
        next = buildLocalShorts({ topic: trimmed, template, tone });
        if (server.state === 'local' && server.reason === 'no_key') notify(NOTE.noKey, 'info');
      }
      apply(next);
      if (next.source === 'ai') notify('AI가 쓴 6컷 대본이 도착했어요. 바로 재생됩니다.');
    } catch (error) {
      notify(error instanceof Error ? error.message : '대본을 만들지 못했습니다.', 'error');
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

  /** 컷 길이 — 0.8~12초. 늘리면 그 컷의 카메라 무빙도 같은 비율로 느려집니다. */
  const setCutDuration = useCallback((id: string, seconds: number) => {
    const clamped = Math.max(MIN_CUT_SECONDS, Math.min(MAX_CUT_SECONDS, Number.isFinite(seconds) ? seconds : 3));
    setShorts((prev) => ({
      ...prev,
      cuts: prev.cuts.map((cut) => (cut.id === id ? { ...cut, duration: Math.round(clamped * 10) / 10 } : cut)),
      updatedAt: Date.now(),
    }));
  }, []);

  const setCutImage = useCallback((id: string, image: ShotImage | undefined) => {
    setShorts((prev) => ({
      ...prev,
      cuts: prev.cuts.map((cut) => (cut.id === id ? { ...cut, image } : cut)),
      updatedAt: Date.now(),
    }));
  }, []);

  /** 내 이미지로 바뀐 컷을 일러스트로 되돌립니다. */
  const clearCutImage = useCallback((id: string) => {
    setShorts((prev) => ({
      ...prev,
      cuts: prev.cuts.map((cut) => (cut.id === id ? { ...cut, image: undefined } : cut)),
      updatedAt: Date.now(),
    }));
  }, []);

  /** 컷에 내 사진·캐처를 올립니다(9:16 으로 줄여 보관). */
  const uploadCutImage = useCallback(
    async (id: string, file: File) => {
      try {
        const result = await addSceneImage(file);
        setCutImage(id, result.image);
        notify(
          result.stored ? '이 컷에 내 이미지를 넣었습니다.' : '내 이미지를 넣었습니다(저장 공간 부족으로 이번 세션에서만 유지).',
          result.stored ? 'info' : 'warn',
        );
      } catch (error) {
        notify(error instanceof Error ? error.message : '이미지를 넣지 못했습니다.', 'warn');
      }
    },
    [notify, setCutImage],
  );

  const setAudio = useCallback((patch: Partial<AudioSettings>) => {
    setShorts((prev) => ({ ...prev, audio: { ...audioOf(prev), ...patch }, updatedAt: Date.now() }));
  }, []);

  const setStyle = useCallback((patch: Partial<CaptionStyle>) => {
    setShorts((prev) => ({ ...prev, style: { ...styleOf(prev), ...patch }, updatedAt: Date.now() }));
  }, []);

  const setBrand = useCallback((patch: Partial<BrandSettings>) => {
    setShorts((prev) => ({ ...prev, brand: { ...brandOf(prev), ...patch }, updatedAt: Date.now() }));
  }, []);

  const jumpTo = useCallback((index: number) => {
    seekSeq.current += 1;
    setSeekRequest({ index, nonce: seekSeq.current });
  }, []);

  const selectTemplate = useCallback((id: TemplateId) => {
    setTemplate(id);
    // 템플릿을 바꾸면 어울리는 배경음도 함께 — 사용자가 이미 무드를 바꿨다면 그대로 둡니다.
    setShorts((prev) => ({ ...prev, audio: { ...audioOf(prev), mood: BGM_BY_TEMPLATE[id] } }));
    // 직접 쓴 주제는 지우지 않습니다. 비어 있거나 다른 템플릿의 추천 주제일 때만 채웁니다.
    setTopic((prev) => {
      const trimmed = prev.trim();
      const isSuggestion = TEMPLATES.some((item) => item.topics.includes(trimmed));
      if (!trimmed || isSuggestion) return TEMPLATE_MAP[id].topics[0] ?? '';
      return prev;
    });
  }, []);

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = PRESET_MAP[presetId];
      if (!preset) return;
      apply(buildPresetShorts(preset), 'source');
      notify(`'${preset.label}' 프리셋을 열었어요. 그대로 저장하거나 문장만 고치면 됩니다.`);
    },
    [apply, notify],
  );

  const saveDraft = useCallback(
    (name: string) => {
      // 요금제별 드래프트 한도 — Free 3개, Pro 24개, Team 200개(사실상 무제한).
      const limit = limitsOf(getPlan()).draftLimit;
      if (projects.length >= limit && !projects.some((project) => project.name === (name.trim() || shorts.title))) {
        notify(`드래프트는 지금 요금제에서 ${limit}개까지입니다. 오래된 드래프트를 지우거나 Pro로 올려 주세요.`, 'warn');
        return false;
      }
      const result = saveProject(name, shorts);
      setProjects(listProjects());
      notify(
        result.ok
          ? `'${name.trim() || shorts.title}' 드래프트로 저장했습니다.`
          : '저장 공간이 부족해 드래프트를 저장하지 못했어요. 오래된 드래프트를 지워 주세요.',
        result.ok ? 'info' : 'error',
      );
      return result.ok;
    },
    [notify, projects.length, shorts],
  );

  const loadDraft = useCallback(
    (id: string) => {
      const draft = loadProject(id);
      if (!draft) {
        notify('드래프트를 찾지 못했어요. 목록을 새로 고칩니다.', 'warn');
        setProjects(listProjects());
        return;
      }
      setShorts(draft);
      setTopic(draft.topic);
      setTemplate(draft.template);
      setTone(draft.tone);
      setPlayNonce((value) => value + 1);
      notify(`'${draft.title}' 드래프트를 열었어요.`);
    },
    [notify],
  );

  const removeDraft = useCallback(
    (id: string) => {
      deleteProject(id);
      setProjects(listProjects());
      notify('드래프트를 지웠습니다.');
    },
    [notify],
  );

  const totalSeconds = useMemo(() => shorts.cuts.reduce((sum, cut) => sum + cut.duration, 0), [shorts.cuts]);

  return {
    topic,
    setTopic,
    template,
    tone,
    setTone,
    selectTemplate,
    applyPreset,
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
    setCutDuration,
    setCutImage,
    clearCutImage,
    uploadCutImage,
    setAudio,
    setStyle,
    setBrand,
    jumpTo,
    playNonce,
    seekRequest,
    toasts,
    notify,
    saved,
    projects,
    saveDraft,
    loadDraft,
    removeDraft,
  };
}

export type Studio = ReturnType<typeof useShorts>;
