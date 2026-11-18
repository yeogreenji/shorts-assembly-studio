/** 시드 하나로 같은 그림을 다시 그리는 작은 난수 도구. */

export function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 — 0~1 균등 난수 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  next: () => number;
  range: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  pick: <T>(list: readonly T[]) => T;
  chance: (probability: number) => boolean;
  shuffle: <T>(list: readonly T[]) => T[];
}

export function createRng(seedText: string): Rng {
  const next = mulberry32(hashString(seedText));
  const range = (min: number, max: number) => min + next() * (max - min);
  const int = (min: number, max: number) => Math.floor(range(min, max + 1));
  const pick = <T,>(list: readonly T[]): T => list[Math.min(list.length - 1, Math.floor(next() * list.length))] as T;
  const shuffle = <T,>(list: readonly T[]): T[] => {
    const copy = [...list];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(next() * (index + 1));
      const a = copy[index] as T;
      const b = copy[swap] as T;
      copy[index] = b;
      copy[swap] = a;
    }
    return copy;
  };
  return { next, range, int, pick, chance: (probability: number) => next() < probability, shuffle };
}

/** 새 영상마다 다른 시드 문자열. */
export function newSeed(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
