import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Cut, Project } from '../types';
import { TEMPLATES, draftToProject, type DraftTemplate } from '../lib/presets';
import { loadStoredProject, saveStoredProject } from '../lib/storage';

let cutSeq = 0;

export function makeCut(partial: Partial<Cut> = {}): Cut {
  cutSeq += 1;
  return {
    id: `cut-${Date.now().toString(36)}-${cutSeq}`,
    role: 'body',
    headline: '',
    subtitle: '',
    narration: '',
    duration: 4,
    theme: 'sunset',
    camera: 'auto',
    image: null,
    audio: null,
    ...partial,
  };
}

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'warn' | 'error';
}

const SERVER_KEY = 'shortcut-studio:server-url';
export const DEFAULT_SERVER_URL = 'http://localhost:8787';

function loadServerUrl(): string {
  try {
    return localStorage.getItem(SERVER_KEY) ?? DEFAULT_SERVER_URL;
  } catch {
    return DEFAULT_SERVER_URL;
  }
}

export function useStudio() {
  const [project, setProject] = useState<Project>(() => {
    const stored = loadStoredProject();
    if (stored) return stored;
    // 기본값은 장면 일러스트 4컷이 붙은 밸런스 게임 프리셋으로 시작합니다.
    return draftToProject(TEMPLATES[0] ?? null, '월급 1.5배 매일 야근 vs 칼퇴 월급 동결');
  });
  const [serverUrl, setServerUrlState] = useState<string>(() => loadServerUrl());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'stripped' | 'failed'>('saved');
  const toastSeq = useRef(0);

  const setServerUrl = useCallback((next: string) => {
    setServerUrlState(next);
    try {
      localStorage.setItem(SERVER_KEY, next);
    } catch {
      /* 저장 실패는 무시 */
    }
  }, []);

  const notify = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    toastSeq.current += 1;
    const id = toastSeq.current;
    setToasts((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  useEffect(() => {
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      const result = saveStoredProject(project);
      if (result === 'ok') setSaveState('saved');
      else if (result === 'stripped') setSaveState('stripped');
      else if (result === 'failed') setSaveState('failed');
      else setSaveState('saved');
    }, 700);
    return () => window.clearTimeout(timer);
  }, [project]);

  const patch = useCallback((changes: Partial<Project>) => {
    setProject((prev) => ({ ...prev, ...changes, updatedAt: Date.now() }));
  }, []);

  const updateCut = useCallback((id: string, changes: Partial<Cut>) => {
    setProject((prev) => ({
      ...prev,
      cuts: prev.cuts.map((cut) => (cut.id === id ? { ...cut, ...changes } : cut)),
      updatedAt: Date.now(),
    }));
  }, []);

  const addCut = useCallback(
    (afterId?: string) => {
      setProject((prev) => {
        const next = makeCut({
          theme: prev.cuts[prev.cuts.length - 1]?.theme ?? 'sunset',
          duration: 4,
          headline: '새 컷',
          subtitle: '*강조*할 문장을 적어보세요',
          narration: '강조할 문장을 적어보세요.',
        });
        if (!afterId) return { ...prev, cuts: [...prev.cuts, next], updatedAt: Date.now() };
        const index = prev.cuts.findIndex((cut) => cut.id === afterId);
        const cuts = [...prev.cuts];
        cuts.splice(index + 1, 0, next);
        return { ...prev, cuts, updatedAt: Date.now() };
      });
    },
    [],
  );

  const duplicateCut = useCallback((id: string) => {
    setProject((prev) => {
      const index = prev.cuts.findIndex((cut) => cut.id === id);
      if (index < 0) return prev;
      const source = prev.cuts[index];
      if (!source) return prev;
      const copy = makeCut({ ...source, id: makeCut().id });
      const cuts = [...prev.cuts];
      cuts.splice(index + 1, 0, copy);
      return { ...prev, cuts, updatedAt: Date.now() };
    });
  }, []);

  const removeCut = useCallback((id: string) => {
    setProject((prev) => {
      if (prev.cuts.length <= 1) return prev;
      return { ...prev, cuts: prev.cuts.filter((cut) => cut.id !== id), updatedAt: Date.now() };
    });
  }, []);

  const moveCut = useCallback((id: string, direction: -1 | 1) => {
    setProject((prev) => {
      const index = prev.cuts.findIndex((cut) => cut.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.cuts.length) return prev;
      const cuts = [...prev.cuts];
      const [item] = cuts.splice(index, 1);
      if (!item) return prev;
      cuts.splice(target, 0, item);
      return { ...prev, cuts, updatedAt: Date.now() };
    });
  }, []);

  const applyDraft = useCallback(
    (template: DraftTemplate | null, topic: string) => {
      setProject((prev) => {
        const next = draftToProject(template, topic);
        return {
          ...next,
          id: prev.id,
          voice: prev.voice,
          aiVoice: prev.aiVoice,
          subtitle: prev.subtitle,
          headline: prev.headline,
        };
      });
      notify('대본 초안을 새로 채웠습니다. 컷별 자막을 다듬어 보세요.');
    },
    [notify],
  );

  const loadProject = useCallback((incoming: Project) => {
    setProject({ ...incoming, updatedAt: Date.now() });
  }, []);

  const totalSeconds = useMemo(
    () => project.cuts.reduce((sum, cut) => sum + cut.duration, 0),
    [project.cuts],
  );

  return {
    project,
    setProject,
    serverUrl,
    setServerUrl,
    patch,
    updateCut,
    addCut,
    duplicateCut,
    removeCut,
    moveCut,
    applyDraft,
    loadProject,
    totalSeconds,
    toasts,
    notify,
    saveState,
  };
}

export type Studio = ReturnType<typeof useStudio>;
