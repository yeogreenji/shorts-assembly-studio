import type { Shorts, TemplateId } from '../types';
import { TEMPLATE_MAP, roleOf } from './templates';
import { clampText } from './text';
import { newSeed } from './scenes';

const KEY = 'shortcut-studio:shorts:v2';

function isShorts(value: unknown): value is Shorts {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<Shorts>;
  if (!Array.isArray(record.cuts) || record.cuts.length !== 6) return false;
  if (!TEMPLATE_MAP[record.template as TemplateId]) return false;
  return record.cuts.every(
    (cut) => cut && typeof cut.subtitle === 'string' && typeof cut.duration === 'number' && typeof cut.emoji === 'string',
  );
}

export function loadShorts(): Shorts | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isShorts(parsed)) return null;
    return {
      ...parsed,
      seed: typeof parsed.seed === 'number' ? parsed.seed : newSeed(),
      cuts: parsed.cuts.map((cut, index) => ({ ...cut, role: roleOf(index), id: cut.id || `cut-${index}` })),
    };
  } catch {
    return null;
  }
}

export function saveShorts(shorts: Shorts): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(shorts));
    return true;
  } catch {
    return false;
  }
}

/** 저장 파일 이름에 쓸 안전한 이름. */
export function fileBase(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clampText(cleaned || 'shorts', 40).replace(/…$/, '');
}
