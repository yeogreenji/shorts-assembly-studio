import type { Shorts } from '../types';
import { normalizeShorts } from './storage';
import { TEMPLATE_MAP } from './templates';

/**
 * 이름 붙여 저장하는 드래프트 — 브라우저(localStorage)에만 남습니다.
 * 서버 업로드도, 계정도 없으므로 프로젝트가 밖으로 나가지 않습니다.
 */

const KEY = 'shortcut-studio:projects:v1';
const MAX_PROJECTS = 24;

interface StoredProject {
  id: string;
  name: string;
  savedAt: number;
  shorts: unknown;
}

export interface ProjectMeta {
  id: string;
  name: string;
  savedAt: number;
  cuts: number;
  seconds: number;
  template: string;
}

function readAll(): StoredProject[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StoredProject => Boolean(item) && typeof item === 'object' && typeof (item as StoredProject).id === 'string');
  } catch {
    return [];
  }
}

function writeAll(projects: StoredProject[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(projects.slice(0, MAX_PROJECTS)));
    return true;
  } catch {
    return false;
  }
}

export function listProjects(): ProjectMeta[] {
  return readAll()
    .map((project) => {
      const shorts = normalizeShorts(project.shorts);
      return {
        id: project.id,
        name: project.name,
        savedAt: project.savedAt,
        cuts: shorts?.cuts.length ?? 0,
        seconds: shorts?.cuts.reduce((sum, cut) => sum + cut.duration, 0) ?? 0,
        template: shorts ? TEMPLATE_MAP[shorts.template]?.label ?? '' : '',
      };
    })
    .sort((a, b) => b.savedAt - a.savedAt);
}

export function saveProject(name: string, shorts: Shorts): { ok: boolean; id: string } {
  const clean = name.trim().slice(0, 40) || shorts.title || '새 프로젝트';
  const projects = readAll();
  const entry: StoredProject = {
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    name: clean,
    savedAt: Date.now(),
    shorts,
  };
  const ok = writeAll([entry, ...projects]);
  return { ok, id: entry.id };
}

export function loadProject(id: string): Shorts | null {
  const project = readAll().find((item) => item.id === id);
  if (!project) return null;
  return normalizeShorts(project.shorts);
}

export function deleteProject(id: string): void {
  writeAll(readAll().filter((project) => project.id !== id));
}

export function renameProject(id: string, name: string): void {
  const clean = name.trim().slice(0, 40);
  if (!clean) return;
  writeAll(readAll().map((project) => (project.id === id ? { ...project, name: clean } : project)));
}
