import type { ShotImage } from '../types';
import { forgetUpload, registerUpload } from './motion/artLoader';

/**
 * 내 이미지 보관함 — 컷마다 내 사진·캡처를 올려 쓸 수 있습니다.
 * 본문(Shorts)에는 { id, name } 참조만 남기고, 그림은 여기 한 곳에 모읍니다.
 *  · 올릴 때 720×1280(9:16)으로 줄여 저장 — 용량과 렌더 속도를 지키고, 영상에도 그대로 구워집니다
 *  · 저장 공간이 부족하면 이번 세션에서만 쓰도록 알리고 계속 진행합니다
 */

const IMAGE_KEY = 'shortcut-studio:images:v1';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const TARGET_W = 720;
const TARGET_H = 1280;

interface StoredImage {
  name: string;
  dataUrl: string;
  addedAt: number;
}

type Store = Record<string, StoredImage>;

let cache: Store | null = null;
let hydrated = false;

function read(): Store {
  if (cache) return cache;
  cache = {};
  try {
    const raw = localStorage.getItem(IMAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (!value || typeof value !== 'object') continue;
          const record = value as Partial<StoredImage>;
          if (typeof record.dataUrl !== 'string' || !record.dataUrl.startsWith('data:image/')) continue;
          cache[id] = { name: typeof record.name === 'string' ? record.name : '내 이미지', dataUrl: record.dataUrl, addedAt: record.addedAt ?? 0 };
        }
      }
    }
  } catch {
    cache = {};
  }
  return cache;
}

function persist(store: Store): boolean {
  try {
    localStorage.setItem(IMAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function listImages(): { id: string; name: string; dataUrl: string; addedAt: number }[] {
  return Object.entries(read())
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => b.addedAt - a.addedAt);
}

export function getImageDataUrl(id: string | undefined): string {
  if (!id) return '';
  return read()[id]?.dataUrl ?? '';
}

export function imageRef(id: string | undefined): ShotImage | null {
  if (!id) return null;
  const stored = read()[id];
  return stored ? { id, name: stored.name } : null;
}

export function imageName(id: string | undefined): string {
  if (!id) return '';
  return read()[id]?.name ?? '';
}

/** 앱을 열 때 — 저장된 내 이미지를 캔버스 창고에 올립니다. */
export function hydrateImages(): void {
  if (hydrated) return;
  hydrated = true;
  for (const [id, value] of Object.entries(read())) {
    void registerUpload(id, value.dataUrl);
  }
}

export function removeImage(id: string): void {
  const store = read();
  if (!store[id]) return;
  delete store[id];
  persist(store);
  forgetUpload(id);
}

function newId(): string {
  return `im${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function loadElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이미지를 읽지 못했습니다. JPG·PNG·WebP 파일로 다시 시도해 주세요.'));
    };
    image.src = url;
  });
}

function validate(file: File): string | null {
  if (!file.type.startsWith('image/')) return '이미지 파일만 올릴 수 있어요(JPG·PNG·WebP).';
  if (file.size > MAX_UPLOAD_BYTES) return `이미지는 ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB까지 올릴 수 있어요.`;
  return null;
}

/** 9:16 화면을 꽉 채우도록 가운데를 잘라 720×1280으로 줄입니다. */
export async function prepareSceneImage(file: File): Promise<string> {
  const image = await loadElement(file);
  const canvas = document.createElement('canvas');
  canvas.width = TARGET_W;
  canvas.height = TARGET_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이 브라우저에서는 이미지를 처리할 수 없습니다.');
  const scale = Math.max(TARGET_W / image.naturalWidth, TARGET_H / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, (TARGET_W - width) / 2, (TARGET_H - height) / 2, width, height);
  const webp = canvas.toDataURL('image/webp', 0.82);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.85);
}

/** 로고는 투명 배경을 살려 256px 안에 맞춥니다. */
export async function prepareLogo(file: File): Promise<string> {
  const image = await loadElement(file);
  const box = 256;
  const canvas = document.createElement('canvas');
  canvas.width = box;
  canvas.height = box;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이 브라우저에서는 이미지를 처리할 수 없습니다.');
  const scale = Math.min(box / image.naturalWidth, box / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, (box - width) / 2, (box - height) / 2, width, height);
  return canvas.toDataURL('image/png');
}

export interface AddResult {
  image: ShotImage;
  /** 저장 공간에 남지 못하고 이번 세션에서만 쓰는 경우 false */
  stored: boolean;
}

async function add(file: File, prepare: (file: File) => Promise<string>, name: string): Promise<AddResult> {
  const error = validate(file);
  if (error) throw new Error(error);
  const dataUrl = await prepare(file);
  const store = read();
  const id = newId();
  store[id] = { name: name.trim().slice(0, 40) || '내 이미지', dataUrl, addedAt: Date.now() };
  const stored = persist(store);
  void registerUpload(id, dataUrl);
  return { image: { id, name: store[id].name }, stored };
}

export function addSceneImage(file: File): Promise<AddResult> {
  return add(file, prepareSceneImage, file.name.replace(/\.[^.]+$/, ''));
}

export function addLogoImage(file: File): Promise<AddResult> {
  return add(file, prepareLogo, '로고');
}
