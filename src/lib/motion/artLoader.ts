import type { ArtDef } from './art';

/**
 * 일러스트 로더.
 * public/webtoon/*.webp 를 브라우저에서 미리 불러 두고, 캔버스는 준비된 그림만 그립니다.
 * 아직 안 온 컷은 대표색 그라데이션으로 먼저 채워 검은 화면이 보이지 않게 합니다.
 * 사용자가 올린 내 이미지도 같은 창고(id `img:...`)에 담겨 컷 그림으로 쓰입니다.
 */

const images = new Map<string, HTMLImageElement>();
const waiting = new Map<string, Promise<HTMLImageElement | null>>();
const uploads = new Map<string, { dataUrl: string; promise: Promise<HTMLImageElement | null> }>();
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

/** 업로드 이미지의 캔버스용 id — 일러스트 id와 섞이지 않게 접두사를 붙입니다. */
export function uploadArtId(imageId: string): string {
  return `img:${imageId}`;
}

export function isUploadArtId(id: string): boolean {
  return id.startsWith('img:');
}

export function artUrl(file: string): string {
  if (!file) return '';
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

/** data URL을 캔버스 그림 창고에 올립니다(같은 id·같은 그림이면 다시 만들지 않음). */
export function registerUpload(imageId: string, dataUrl: string): Promise<HTMLImageElement | null> {
  const id = uploadArtId(imageId);
  const existing = uploads.get(id);
  if (existing) {
    if (existing.dataUrl === dataUrl) return existing.promise;
    images.delete(id);
    uploads.delete(id);
  }
  const promise = new Promise<HTMLImageElement | null>((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      images.set(id, image);
      if (!stats().loaded.includes(id)) stats().loaded.push(id);
      notify();
      resolve(image);
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
  uploads.set(id, { dataUrl, promise });
  return promise;
}

export function forgetUpload(imageId: string): void {
  const id = uploadArtId(imageId);
  uploads.delete(id);
  images.delete(id);
}

/** 그림 한 장을 불러옵니다. 실패해도 영상은 대표색 배경으로 계속 진행됩니다. */
export function preloadArt(art: ArtDef | string): Promise<HTMLImageElement | null> {
  const id = typeof art === 'string' ? art : art.id;
  const ready = getArt(id);
  if (ready) return Promise.resolve(ready);
  if (isUploadArtId(id)) {
    // 업로드 그림은 이미 창고에 있거나, 아직 등록되지 않은 것입니다(네트워크로 받지 않음).
    const entry = uploads.get(id);
    return entry ? entry.promise : Promise.resolve(null);
  }
  const file = typeof art === 'string' ? `webtoon/${art}.webp` : art.file;
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
