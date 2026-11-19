import type { CameraPlan } from './scene';
import { rgba } from './color';

/** 9:16 스테이지 — 모든 그리기는 이 좌표계로 하고 캔버스 크기에 맞춰 변환합니다. */
export const STAGE_W = 1080;
export const STAGE_H = 1920;

/** 작은 화면(모바일 미리보기)에서는 세부 묘사를 줄여 프레임을 지킵니다. */
export const quality = { detail: 1 };

/**
 * 모션 강도 — 미리보기·영상이 같은 값을 씁니다.
 * calm: 자막 읽기 편한 다큐 느낌 / vivid: 기본 숏츠 / boom: 도파민 최대
 */
export type MotionLevel = 'calm' | 'vivid' | 'boom';

export const MOTION_LEVELS: { id: MotionLevel; label: string; hint: string }[] = [
  { id: 'calm', label: '차분', hint: '천천히 흐르는 시네마틱' },
  { id: 'vivid', label: '생생', hint: '숏츠 기본 리듬' },
  { id: 'boom', label: '폭발', hint: '비트마다 확 밀고 당김' },
];

export const MOTION_SCALE: Record<MotionLevel, number> = { calm: 0.62, vivid: 1, boom: 1.55 };

export function motionScale(level: MotionLevel | number | undefined): number {
  if (typeof level === 'number') return Math.max(0.2, Math.min(2.2, level));
  return MOTION_SCALE[level ?? 'vivid'];
}

export interface CamState {
  zoom: number;
  x: number;
  y: number;
  rot: number;
  /** 이 컷에서 화면이 얼마나 격하게 움직이는지(0~1.6) — 파티클·블러 세기에 씁니다. */
  energy: number;
}

export interface RngLike {
  next: () => number;
  range: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  pick: <T>(list: readonly T[]) => T;
  chance: (probability: number) => boolean;
}

const easeOut = (value: number) => 1 - (1 - value) ** 3;
const easeInOut = (value: number) => (value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2);
const easeOutQuint = (value: number) => 1 - (1 - Math.min(1, Math.max(0, value))) ** 5;

/** 자막의 강조 단어가 터지는 순간 — 카메라도 같은 박자로 밀어 줍니다. */
const BEATS = [0.16, 0.48, 0.8] as const;

/** 비트 펄스(0~1.2). p는 컷 진행도. */
export function beatPulse(p: number, spread = 0.085): number {
  let total = 0;
  for (const beat of BEATS) {
    const distance = (p - beat) / spread;
    if (Math.abs(distance) < 2.4) total += Math.exp(-distance * distance * 1.9);
  }
  return Math.min(1.2, total);
}

/** 컷에 들어오는 순간의 오버슈트(1 → 0). */
const entryKick = (p: number) => Math.exp(-13 * Math.max(0, p));

/** 컷 끝에서 다음 컷으로 넘겨주는 빠른 빼기(0 → 1). */
const exitKick = (p: number) => Math.max(0, (p - 0.86) / 0.14) ** 2;

/**
 * 컷 진행도(p)와 시간(t)으로 카메라 위치·배율·각도를 만듭니다.
 * 한 컷 안에서도 비트마다 밀고 당겨, 정지 사진이 아니라 계속 찍고 있는 영상처럼 보이게 합니다.
 * zoom 1 = 일러스트가 화면을 꽉 채운 상태.
 */
export function cameraAt(plan: CameraPlan, p: number, t: number, scale = 1): CamState {
  const k = plan.intensity * scale;
  const e = easeInOut(Math.min(1, Math.max(0, p)));
  const out = easeOut(Math.min(1, Math.max(0, p)));
  const kick = entryKick(p);
  const exit = exitKick(p);
  const beat = beatPulse(p) * k;
  const breatheX = Math.sin(t * 0.9) * 7 * scale;
  const breatheY = Math.cos(t * 0.7) * 6 * scale;
  const dir = plan.direction;
  const boost = 1 + 0.05 * beat;
  const finish = 1 - 0.05 * exit * k;

  switch (plan.move) {
    case 'pull':
      return {
        zoom: (1.34 - 0.26 * out * k) * boost * (1 + 0.055 * kick * scale) * finish,
        x: 18 * dir * e + breatheX,
        y: -18 * e + breatheY,
        rot:0,
        energy: 0.9 * k,
      };
    case 'punch': {
      const hit = Math.exp(-5.5 * p) * (0.6 + 0.4 * Math.cos(p * 26));
      return {
        zoom: (1.06 + 0.2 * k * out + 0.11 * hit * k) * boost * (1 + 0.06 * kick * scale) * finish,
        x: -14 * dir * e + Math.sin(t * 30) * 12 * k * Math.exp(-4.4 * p),
        y: breatheY + Math.cos(t * 34) * 10 * k * Math.exp(-4.4 * p),
        rot: 0.02 * dir * Math.sin(p * 16) * k * Math.exp(-3 * p),
        energy: 1.45 * k,
      };
    }
    case 'whip':
      return {
        zoom: (1.24 - 0.02 * e) * boost * (1 + 0.05 * kick * scale) * finish,
        x: dir * 330 * (1 - easeOutQuint(p)) * k + breatheX,
        y: 10 * e + breatheY,
        rot: -0.03 * dir * (1 - out) * k,
        energy: 1.5 * k,
      };
    case 'drift':
      return {
        zoom: (1.24 + 0.06 * out) * boost * (1 + 0.05 * kick * scale) * finish,
        x: -190 * dir * e * k + breatheX,
        y: 26 * e * dir + breatheY,
        rot: 0.012 * dir * e,
        energy: 1.05 * k,
      };
    case 'tilt':
      return {
        zoom: (1.22 + 0.04 * out) * boost * (1 + 0.05 * kick * scale) * finish,
        x: 18 * e * dir + breatheX,
        y: 180 * e * k - 40 * out + breatheY,
        rot: -0.018 * e,
        energy: 1.0 * k,
      };
    case 'shake': {
      const decay = Math.exp(-2.2 * p);
      return {
        zoom: (1.22 + 0.04 * out) * boost * (1 + 0.06 * kick * scale) * finish,
        x: (Math.sin(t * 27) * 26 + Math.sin(t * 41) * 12) * k * decay + breatheX,
        y: (Math.cos(t * 31) * 22 + Math.cos(t * 47) * 10) * k * decay,
        rot: Math.sin(t * 19) * 0.03 * k * decay,
        energy: 1.6 * k,
      };
    }
    case 'handheld':
      return {
        zoom: (1.2 + 0.05 * out) * boost * finish,
        x: (Math.sin(t * 1.7) * 26 + Math.sin(t * 3.9) * 12) * scale + breatheX,
        y: (Math.cos(t * 2.1) * 20 + Math.sin(t * 4.7) * 9) * scale,
        rot: Math.sin(t * 1.4) * 0.012,
        energy: 1.0 * k,
      };
    case 'orbit':
      return {
        zoom: (1.26 + 0.05 * Math.sin(e * Math.PI)) * boost * (1 + 0.05 * kick * scale) * finish,
        x: 120 * dir * Math.sin(e * Math.PI) + breatheX,
        y: 46 * Math.sin(e * Math.PI * 2),
        rot: 0.035 * dir * e,
        energy: 1.15 * k,
      };
    case 'slide':
      return {
        zoom: (1.26 - 0.03 * out) * boost * finish,
        x: dir * 300 * (1 - easeOutQuint(p)) * k + breatheX,
        y: -12 * e,
        rot: 0.02 * dir * (1 - out),
        energy: 1.35 * k,
      };
    case 'push':
    default:
      return {
        zoom: (1.07 + 0.24 * out * k) * boost * (1 + 0.06 * kick * scale) * finish,
        x: 14 * dir * e + breatheX,
        y: -22 * e + breatheY,
        rot: 0.006 * Math.sin(p * 9) * dir,
        energy: 1.05 * k,
      };
  }
}

/** 깊이별로 다른 속도로 움직이는 레이어(파티클용). */
export function layer(ctx: CanvasRenderingContext2D, cam: CamState, depth: number, paint: () => void): void {
  const zoom = 1 + (cam.zoom - 1) * (0.55 + 0.45 * depth);
  ctx.save();
  ctx.translate(STAGE_W / 2 + cam.x * depth, STAGE_H / 2 + cam.y * depth);
  ctx.rotate(cam.rot * (0.35 + 0.65 * depth));
  ctx.scale(zoom, zoom);
  ctx.translate(-STAGE_W / 2, -STAGE_H / 2);
  paint();
  ctx.restore();
}

/**
 * 빛 번짐 스프라이트 — 매 프레임 방사형 그라데이션을 새로 만드는 대신
 * 색깔별로 한 번만 만들어 두고 크기만 바꿔 찍습니다(프레임 비용 절반 이하).
 */
const glowSprites = new Map<string, HTMLCanvasElement>();

function glowSprite(color: string): HTMLCanvasElement | null {
  const cached = glowSprites.get(color);
  if (cached) return cached;
  if (typeof document === 'undefined') return null;
  const size = 128;
  const surface = document.createElement('canvas');
  surface.width = size;
  surface.height = size;
  const ctx = surface.getContext('2d');
  if (!ctx) return null;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, rgba(color, 1));
  gradient.addColorStop(0.45, rgba(color, 0.45));
  gradient.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  glowSprites.set(color, surface);
  return surface;
}

export function glowCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
): void {
  const sprite = glowSprite(color);
  const r = Math.max(1, radius);
  if (sprite) {
    const previous = ctx.globalAlpha;
    ctx.globalAlpha = previous * Math.max(0, Math.min(1, alpha));
    ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = previous;
    return;
  }
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
  gradient.addColorStop(0, rgba(color, alpha));
  gradient.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/**
 * 일러스트를 초점(focus)에 맞춰 확대해도 가장자리가 비지 않도록
 * 필요한 최소 배율을 계산합니다.
 */
export function coverZoom(focus: { x: number; y: number }, panX: number, panY: number): number {
  const fx = Math.min(0.92, Math.max(0.08, focus.x));
  const fy = Math.min(0.92, Math.max(0.08, focus.y));
  const left = (STAGE_W / 2 + panX) / (fx * STAGE_W);
  const right = (STAGE_W / 2 - panX) / ((1 - fx) * STAGE_W);
  const top = (STAGE_H / 2 + panY) / (fy * STAGE_H);
  const bottom = (STAGE_H / 2 - panY) / ((1 - fy) * STAGE_H);
  return Math.max(left, right, top, bottom, 1);
}
