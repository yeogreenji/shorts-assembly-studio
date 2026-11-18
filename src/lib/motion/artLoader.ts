import type { ArtDef } from './art';

/**
 * 일러스트 로더.
 * public/webtoon/*.webp 를 브라우저에서 미리 불러 두고, 캔버스는 준비된 그림만 그립니다.
 * 아직 안 온 컷은 대표색 그라데이션으로 먼저 채워 검은 화면이 보이지 않게 합니다.
 */

const images = new Map<string, HTMLImageElement>();
const waiting = new Map<string, Promise<HTMLImageElement | null>>();
const listeners = new Set<() => void>();

declare global {
  interface Window {
    __shortcutArt?: { loaded: string[]; failed: string[] };
  }
}

function stats(): { loaded: string[]; failed: string[] } {
  if (typeof window === 'undefined') return { loaded: [], failed: [] };
  window.__shortcutArt ??= { loaded: [], failed: [] };
  return window.__shortcutArt;
}

export function artUrl(file: string): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');
  return `${base}/${file.replace(/^\/+/, '')}`;
}

export function getArt(id: string | undefined): HTMLImageElement | null {
  if (!id) return null;
  const image = images.get(id);
  return image && image.complete && image.naturalWidth > 0 ? image : null;
}

export function isArtReady(id: string | undefined): boolean {
  return Boolean(getArt(id));
}

export function onArtLoaded(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** 그림 한 장을 불러옵니다. 실패해도 영상은 대표색 배경으로 계속 진행됩니다. */
export function preloadArt(art: ArtDef | string): Promise<HTMLImageElement | null> {
  const id = typeof art === 'string' ? art : art.id;
  const file = typeof art === 'string' ? `webtoon/${art}.webp` : art.file;
  const ready = getArt(id);
  if (ready) return Promise.resolve(ready);
  const inFlight = waiting.get(id);
  if (inFlight) return inFlight;

  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }
    const image = new Image();
    image.decoding = 'async';
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      images.set(id, image);
      if (!stats().loaded.includes(id)) stats().loaded.push(id);
      waiting.delete(id);
      notify();
      resolve(image);
    };
    image.onerror = () => {
      if (!stats().failed.includes(id)) stats().failed.push(id);
      waiting.delete(id);
      resolve(null);
    };
    image.src = artUrl(file);
  });
  waiting.set(id, promise);
  return promise;
}

/** 여러 장을 병렬로 준비합니다(영상 녹화 전에는 반드시 이걸 기다립니다). */
export async function preloadArts(arts: (ArtDef | string)[]): Promise<void> {
  const unique = [...new Map(arts.map((art) => [typeof art === 'string' ? art : art.id, art])).values()];
  await Promise.all(unique.map((art) => preloadArt(art)));
}

/** 미리보기 첫 화면용 — 첫 컷은 바로, 나머지는 뒤이어. */
export function warmUp(arts: (ArtDef | string)[]): void {
  void preloadArts(arts);
}
