import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type { Shorts, VoiceId } from '../types';
import { stripMarks } from '../lib/text';
import {
  ensureClip,
  getClip,
  loadClips,
  narrationSource,
  narrationVersion,
  serverTtsState,
  subscribeNarration,
  voiceOf,
  type Clip,
} from '../lib/audio/tts';
import { limitsOf, type Limits, usePlan } from '../lib/plan';

/** 나레이션 상태가 바뀔 때마다 다시 그리기 — 컷마다 '준비됨/생성 중'을 실시간으로 보여 줍니다. */
export function useNarrationTick(): number {
  return useSyncExternalStore(subscribeNarration, narrationVersion, narrationVersion);
}

export interface NarrationView {
  /** 컷 순서대로의 음성 조각 */
  clips: Clip[];
  texts: string[];
  ready: number;
  total: number;
  voice: VoiceId;
  preset: ReturnType<typeof voiceOf>;
  source: ReturnType<typeof narrationSource>;
  serverState: ReturnType<typeof serverTtsState>;
  limits: Limits;
  /** 요금제 때문에 잠긴 보이스인지 */
  locked: boolean;
  reload: () => Promise<void>;
  ensureOne: (index: number) => Promise<Clip>;
}

/**
 * 지금 대본 6컷의 음성을 확보하고 상태를 돌려줍니다.
 * 무료 플랜에서 잠긴 보이스를 골랐다면 실제로는 기본 보이스로 읽습니다(화면에서 잠금을 표시).
 */
export function useNarration(shorts: Shorts): NarrationView {
  const tick = useNarrationTick();
  const plan = usePlan();
  const limits = useMemo(() => limitsOf(plan), [plan]);
  const texts = useMemo(() => shorts.cuts.map((cut) => stripMarks(cut.subtitle)), [shorts.cuts]);
  const wanted = shorts.audio.voice ?? 'clear';
  const voice: VoiceId = limits.voices.includes(wanted) ? wanted : 'clear';
  const preset = voiceOf(voice);

  const reload = useCallback(async () => {
    await loadClips(texts, voice);
  }, [texts, voice]);

  const ensureOne = useCallback((index: number) => ensureClip(texts[index] ?? '', voice), [texts, voice]);

  // tick을 의존성으로 두어 음성이 도착할 때마다 새 상태를 읽습니다.
  const clips = useMemo(() => {
    void tick;
    return texts.map((text) => getClip(text, voice));
  }, [texts, voice, tick]);

  return {
    clips,
    texts,
    ready: clips.filter((clip) => clip.status === 'ready').length,
    total: clips.length,
    voice,
    preset,
    source: narrationSource(),
    serverState: serverTtsState(),
    limits,
    locked: wanted !== voice,
    reload,
    ensureOne,
  };
}
