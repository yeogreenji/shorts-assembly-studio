import type { DeliveryId, Shot } from '../../types';
import { stripMarks } from '../text';

/**
 * 나레이션 설계 — 문장을 '호흡 블록'으로 묶고, 블록 길이를 컷 길이로 나눕니다.
 *
 *  · 컷마다 짧은 자막을 따로 읽으면 문장이 뚝뚝 끊깁니다(예전 방식).
 *  · 2~4컷의 나레이션 문장을 한 호흡(최대 140자)으로 이어 붙여 한 번에 읽으면
 *    문장 사이 억양이 살아 있고, 이웃한 컷이 같은 숨으로 넘어갑니다.
 *  · 블록 음성의 실제 길이를 컷 글자 수 비율로 나눠 '컷 길이 자동 맞춤'에 씁니다.
 */

/** 한 번에 읽는 최대 글자 수 — Google TTS(190자)보다 여유 있게, 실패하면 컷 단위로 다시 시도합니다. */
export const MAX_BLOCK_CHARS = 140;
/** 블록을 일찍 닫지 않을 최소 길이 — 마지막 블록만 예외입니다. */
const MIN_BLOCK_CHARS = 54;

export interface NarrationBlock {
  index: number;
  /** 이 블록이 읽는 컷 번호들(연속) */
  cutIndexes: number[];
  /** 실제로 읽을 문장 — 컷 문장을 호흡에 맞게 이어 붙인 것 */
  text: string;
  chars: number;
}

/** 컷을 소리 내어 읽는 문장 — voice가 있으면 그것, 없으면 자막. */
export function narrationTextOf(shot: Shot): string {
  const explicit = (shot.voice ?? '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  if (explicit) return explicit;
  return stripMarks(shot.subtitle);
}

const ENDS_SENTENCE = /[.!?…]$/;
const ENDS_CLAUSE = /[,·]$/;

/**
 * 두 문장을 한 호흡으로 잇습니다.
 * 앞 문장이 마침표로 끝나면 그대로 띄고, 쉼표·말줄임이면 조금 더 쉬게,
 * 아무 표시가 없으면(편집 중인 문장) 마침표를 넣어 다음 문장이 붙어 읽히지 않게 합니다.
 */
export function joinForBreath(before: string, after: string): string {
  const left = before.trim();
  const right = after.trim();
  if (!left) return right;
  if (!right) return left;
  if (ENDS_SENTENCE.test(left)) return `${left} ${right}`;
  if (ENDS_CLAUSE.test(left)) return `${left} ${right}`;
  return `${left}. ${right}`;
}

/** 문장부호를 호흡 길이로 환산 — 쉼표에서 실제로 쉬는 시간을 컷 길이에 넣습니다. */
export function breathWeight(text: string): number {
  const commas = (text.match(/[,·]/g) ?? []).length;
  const stops = (text.match(/[.!?…]/g) ?? []).length;
  return Math.max(1, text.length) + commas * 3 + stops * 6;
}

interface Piece {
  cutIndex: number;
  text: string;
}

/**
 * 나레이션 블록 만들기.
 * 문장이 짧은 컷은 2~4개씩 묶고, 한 컷이 길면 그 컷만 따로 읽습니다.
 * 마지막 블록이 너무 짧으면 앞 블록에 붙여 호흡이 어색하지 않게 합니다.
 */
export function buildNarrationBlocks(cuts: Shot[], maxChars = MAX_BLOCK_CHARS): NarrationBlock[] {
  const pieces: Piece[] = cuts
    .map((cut, index) => ({ cutIndex: index, text: narrationTextOf(cut) }))
    .filter((piece) => piece.text.length > 0);

  const raw: { pieces: Piece[]; text: string; chars: number }[] = [];
  let current: Piece[] = [];
  let text = '';

  const flush = () => {
    if (!current.length || !text.trim()) {
      current = [];
      text = '';
      return;
    }
    raw.push({ pieces: current, text: text.trim(), chars: text.trim().length });
    current = [];
    text = '';
  };

  for (const piece of pieces) {
    // 한 컷이 혼자서도 너무 길면 문장 단위로 쪼갭니다(읽다 잘리지 않게).
    const chunks = piece.text.length > maxChars ? splitSentences(piece.text, maxChars) : [piece.text];
    for (const chunk of chunks) {
      const joined = joinForBreath(text, chunk);
      if (text && joined.length > maxChars) flush();
      text = text ? joinForBreath(text, chunk) : chunk;
      if (!current.some((item) => item.cutIndex === piece.cutIndex)) current.push(piece);
      if (text.length >= maxChars) flush();
    }
  }
  flush();

  // 마지막이 한 문장짜리로 남아 호흡이 끊기면, 앞 블록에 붙일 수 있는 만큼 붙입니다.
  if (raw.length >= 2) {
    const lastBlock = raw[raw.length - 1]!;
    const before = raw[raw.length - 2]!;
    if (lastBlock.chars < MIN_BLOCK_CHARS && before.chars + lastBlock.chars <= maxChars) {
      before.text = joinForBreath(before.text, lastBlock.text);
      before.chars = before.text.length;
      before.pieces = [...before.pieces, ...lastBlock.pieces];
      raw.pop();
    }
  }

  return raw.map((block, index) => ({
    index,
    cutIndexes: block.pieces.map((piece) => piece.cutIndex),
    text: block.text,
    chars: block.chars,
  }));
}

/** 140자를 넘는 한 컷을 문장 경계에서 나눕니다. */
function splitSentences(text: string, maxChars: number): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]?/g) ?? [text];
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    const next = joinForBreath(current, sentence);
    if (current && next.length > maxChars) {
      chunks.push(current.trim());
      current = sentence.trim();
    } else {
      current = next;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [text];
}

/** 블록 안에서 컷이 차지하는 비율 — 글자 수 + 문장부호 호흡. */
export function cutWeights(cuts: Shot[], block: NarrationBlock): number[] {
  return block.cutIndexes.map((index) => {
    const cut = cuts[index];
    return cut ? breathWeight(narrationTextOf(cut)) : 1;
  });
}

/**
 * 블록의 실제 음성 길이를 컷에 나눠 배분합니다.
 * (컷 안에서 자막이 사라지기 전에 다음 그림으로 넘어가지 않도록 0.5초 하한)
 */
export function distributeSeconds(cuts: Shot[], block: NarrationBlock, seconds: number): number[] {
  const weights = cutWeights(cuts, block);
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return weights.map((weight) => Math.max(0.6, (seconds * weight) / total));
}

/** 나레이션 길이에 맞춰 컷 길이 배열을 만듭니다(0.1초 단위). */
export function fitCutDurations(cuts: Shot[], blocks: NarrationBlock[], secondsByBlock: number[]): number[] | null {
  if (!blocks.length) return null;
  const next = cuts.map((cut) => cut.duration);
  for (const block of blocks) {
    const seconds = secondsByBlock[block.index];
    if (!seconds || seconds <= 0) continue;
    const parts = distributeSeconds(cuts, block, seconds);
    block.cutIndexes.forEach((cutIndex, position) => {
      next[cutIndex] = Math.round((parts[position] ?? 2) * 10) / 10;
    });
  }
  return next;
}

/** 블록 안에서 이 컷이 시작하는 상대 시각(초)을 추정합니다 — 음성이 아직 없을 때의 안내용. */
export function estimatedCutOffsets(cuts: Shot[], block: NarrationBlock, seconds: number): number[] {
  const parts = distributeSeconds(cuts, block, seconds);
  const offsets: number[] = [];
  let acc = 0;
  for (const part of parts) {
    offsets.push(acc);
    acc += part;
  }
  return offsets;
}

/* ── 화자 스타일 ────────────────────────────────────────── */

export interface DeliveryPreset {
  id: DeliveryId;
  label: string;
  hint: string;
  /** 속도 배율 — 보이스 프리셋 위에 곱해집니다 */
  rate: number;
  /** 음높이(센트). -100이면 한 반음 낮게 */
  pitch: number;
  /** 문장 사이 호흡(초) 권장값 */
  breath: number;
  /** 낮은 음역 보강(dB) — 목소리에 몸통을 더합니다 */
  warmth: number;
}

export const DELIVERIES: DeliveryPreset[] = [
  {
    id: 'story',
    label: '차분한 스토리텔러',
    hint: '브이로그·썰 · 느긋한 호흡과 낮은 톤',
    rate: 0.96,
    pitch: -35,
    breath: 0.42,
    warmth: 1.6,
  },
  {
    id: 'anchor',
    label: '뉴스 앵커',
    hint: '정보·이슈 · 또렷하고 단단한 발음',
    rate: 1.04,
    pitch: -10,
    breath: 0.2,
    warmth: 0.6,
  },
  {
    id: 'friendly',
    label: '친근한 유튜버',
    hint: '꿀팁·리뷰 · 밝고 경쾌한 리듬',
    rate: 1.1,
    pitch: 30,
    breath: 0.16,
    warmth: 0,
  },
  {
    id: 'drama',
    label: '드라마 예고',
    hint: '연애·반전 · 낮게 깔리는 긴장',
    rate: 0.9,
    pitch: -90,
    breath: 0.5,
    warmth: 3.2,
  },
];

export const DELIVERY_MAP: Record<DeliveryId, DeliveryPreset> = DELIVERIES.reduce(
  (map, preset) => ({ ...map, [preset.id]: preset }),
  {} as Record<DeliveryId, DeliveryPreset>,
);

export function deliveryOf(id: DeliveryId | undefined): DeliveryPreset {
  return (id && DELIVERY_MAP[id]) || DELIVERY_MAP.story;
}

/** 이 컷이 속한 블록 — 화면이 '지금 읽는 블록'을 표시할 때 씁니다. */
export function blockOfCut(blocks: NarrationBlock[], cutIndex: number): NarrationBlock | undefined {
  return blocks.find((block) => block.cutIndexes.includes(cutIndex));
}
