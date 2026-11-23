import type { Shorts, TemplateId } from '../types';
import { TEMPLATE_MAP, roleOf } from './templates';
import { clampText } from './text';
import { withDefaults } from './defaults';

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

/** 저장된 프로젝트를 화면이 쓸 수 있는 형태로 다듬습니다(옛 버전 파일 포함). */
export function normalizeShorts(value: unknown): Shorts | null {
  if (!isShorts(value)) return null;
  const parsed = value as Shorts;
  return withDefaults({
    ...parsed,
    cuts: parsed.cuts.map((cut, index) => ({ ...cut, role: roleOf(index), id: cut.id || `cut-${index}` })),
  });
}

export function loadShorts(): Shorts | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return normalizeShorts(JSON.parse(raw) as unknown);
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
