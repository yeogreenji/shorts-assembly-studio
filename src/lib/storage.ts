import type { Project } from '../types';

const KEY = 'shortcut-studio:project:v1';

function stripMedia(project: Project): Project {
  return {
    ...project,
    cuts: project.cuts.map((cut) => ({ ...cut, image: null, audio: null })),
  };
}

export type SaveStatus = 'ok' | 'stripped' | 'failed' | 'skipped';

export function loadStoredProject(): Project | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Project;
    if (!parsed || !Array.isArray(parsed.cuts) || parsed.cuts.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveStoredProject(project: Project): SaveStatus {
  if (typeof localStorage === 'undefined') return 'skipped';
  const payload = { ...project, updatedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
    return 'ok';
  } catch {
    // 이미지·녹음 데이터가 커서 용량을 넘겼다면 텍스트만 저장합니다.
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...stripMedia(payload), mediaStripped: true } as Project));
      return 'stripped';
    } catch {
      return 'failed';
    }
  }
}

export function clearStoredProject(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function downloadProjectJson(project: Project): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.title || 'project'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}
