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
  ttsServerStatus,
  lastTtsEngine,
  voiceOf,
  type Clip,
  type TtsStatus,
} from '../lib/audio/tts';
import { buildNarrationBlocks, deliveryOf, narrationTextOf, type NarrationBlock } from '../lib/audio/narration';
import { getTake, subscribeTakes, takesVersion, type Take } from '../lib/audio/takes';
import { limitsOf, type Limits, usePlan } from '../lib/plan';

/** 나레이션 상태가 바뀔 때마다 다시 그리기 — 블록마다 '준비됨/생성 중'을 실시간으로 보여 줍니다. */
export function useNarrationTick(): number {
  return useSyncExternalStore(subscribeNarration, narrationVersion, narrationVersion);
}

export function useTakesTick(): number {
  return useSyncExternalStore(subscribeTakes, takesVersion, takesVersion);
}

export interface NarrationView {
  /** 이어 읽는 호흡 블록 — 2~4컷이 한 문장으로 이어집니다 */
  blocks: NarrationBlock[];
  /** 블록 순서대로의 음성 조각 */
  clips: Clip[];
  /** 컷 순서대로의 나레이션 문장 */
  texts: string[];
  /** 컷 순서대로의 자막(별표 제거) */
  captions: string[];
  ready: number;
  total: number;
  /** 대본 전체 글자 수 — 분량 확인용 */
  chars: number;
  voice: VoiceId;
  preset: ReturnType<typeof voiceOf>;
  delivery: ReturnType<typeof deliveryOf>;
  source: ReturnType<typeof narrationSource>;
  serverState: ReturnType<typeof serverTtsState>;
  status: TtsStatus | null;
  engine: string;
  limits: Limits;
  /** 요금제 때문에 잠긴 보이스인지 */
  locked: boolean;
  takes: (Take | undefined)[];
  takesCount: number;
  reload: () => Promise<void>;
  ensureOne: (cutIndex: number) => Promise<Clip[]>;
}

/**
 * 지금 대본의 나레이션을 호흡 블록 단위로 확보하고 상태를 돌려줍니다.
 * 무료 플랜에서 잠긴 보이스를 골랐다면 실제로는 기본 보이스로 읽습니다(화면에서 잠금을 표시).
 */
export function useNarration(shorts: Shorts): NarrationView {
  const tick = useNarrationTick();
  const takeTick = useTakesTick();
  const plan = usePlan();
  const limits = useMemo(() => limitsOf(plan), [plan]);
  const texts = useMemo(() => shorts.cuts.map((cut) => narrationTextOf(cut)), [shorts.cuts]);
  const captions = useMemo(() => shorts.cuts.map((cut) => stripMarks(cut.subtitle)), [shorts.cuts]);
  const blocks = useMemo(() => buildNarrationBlocks(shorts.cuts), [shorts.cuts]);
  const wanted = shorts.audio.voice ?? 'clear';
  const voice: VoiceId = limits.voices.includes(wanted) ? wanted : 'clear';
  const preset = voiceOf(voice);
  const delivery = deliveryOf(shorts.audio.delivery);

  const reload = useCallback(async () => {
    await loadClips(blocks.map((block) => block.text), voice);
  }, [blocks, voice]);

  /** 컷 하나를 읽는 블록(없으면 그 컷 문장)을 확보합니다 — 미리듣기·부분 재생용. */
  const ensureOne = useCallback(
    async (cutIndex: number): Promise<Clip[]> => {
      const block = blocks.find((item) => item.cutIndexes.includes(cutIndex));
      if (block) return [await ensureClip(block.text, voice)];
      const text = texts[cutIndex] ?? '';
      return text ? [await ensureClip(text, voice)] : [];
    },
    [blocks, texts, voice],
  );

  // tick을 의존성으로 두어 음성이 도착할 때마다 새 상태를 읽습니다.
  const clips = useMemo(() => {
    void tick;
    return blocks.map((block) => getClip(block.text, voice));
  }, [blocks, voice, tick]);

  const takes = useMemo(() => {
    void takeTick;
    return shorts.cuts.map((cut) => getTake(cut.id));
  }, [shorts.cuts, takeTick]);

  return {
    blocks,
    clips,
    texts,
    captions,
    ready: clips.filter((clip) => clip.status === 'ready').length,
    total: blocks.length,
    chars: texts.reduce((sum, text) => sum + text.length, 0),
    voice,
    preset,
    delivery,
    source: narrationSource(),
    serverState: serverTtsState(),
    status: ttsServerStatus(),
    engine: lastTtsEngine(),
    limits,
    locked: wanted !== voice,
    takes,
    takesCount: takes.filter(Boolean).length,
    reload,
    ensureOne,
  };
}
