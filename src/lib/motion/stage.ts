import type { CameraPlan } from './scene';
import { rgba } from './color';

/** 9:16 스테이지 — 모든 그리기는 이 좌표계로 하고 캔버스 크기에 맞춰 변환합니다. */
export const STAGE_W = 1080;
export const STAGE_H = 1920;

/** 작은 화면(모바일 미리보기)에서는 세부 묘사를 줄여 프레임을 지킵니다. */
export const quality = { detail: 1 };

export interface CamState {
  zoom: number;
  x: number;
  y: number;
  rot: number;
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

/**
 * 컷 진행도(p)로 카메라(켄 번즈) 위치·배율·각도를 만듭니다.
 * zoom 1 = 일러스트가 화면을 꽉 채운 상태이고, 1보다 크면 그만큼 파고듭니다.
 */
export function cameraAt(plan: CameraPlan, p: number, t: number): CamState {
  const k = plan.intensity;
  const e = easeInOut(Math.min(1, p));
  const out = easeOut(Math.min(1, p));
  const breatheX = Math.sin(t * 0.9) * 6;
  const breatheY = Math.cos(t * 0.7) * 5;
  switch (plan.move) {
    case 'pull':
      return { zoom: 1.2 - 0.16 * out * k, x: breatheX, y: -14 * e + breatheY, rot: 0 };
    case 'punch':
      return { zoom: 1.04 + 0.22 * Math.exp(-3.4 * p) * k, x: -8 * plan.direction * e, y: breatheY, rot: 0.004 * Math.sin(p * 20) * k };
    case 'drift':
      return { zoom: 1.14, x: -92 * plan.direction * e * k + breatheX, y: 12 * e, rot: 0.01 * plan.direction * e };
    case 'tilt':
      return { zoom: 1.13, x: 10 * e, y: 96 * e * k + breatheY, rot: -0.012 * e };
    case 'shake':
      return {
        zoom: 1.12,
        x: Math.sin(t * 27) * 18 * k,
        y: Math.cos(t * 31) * 14 * k,
        rot: Math.sin(t * 19) * 0.014 * k,
      };
    case 'handheld':
      return {
        zoom: 1.1,
        x: Math.sin(t * 1.7) * 20 + Math.sin(t * 3.4) * 9,
        y: Math.cos(t * 2.1) * 16,
        rot: Math.sin(t * 1.4) * 0.009,
      };
    case 'orbit':
      return { zoom: 1.18, x: 70 * plan.direction * Math.sin(e * Math.PI), y: 18 * Math.sin(e * Math.PI * 2), rot: 0.02 * plan.direction * e };
    case 'slide':
      return { zoom: 1.16, x: 110 * plan.direction * (1 - out) * k + breatheX, y: 0, rot: 0 };
    case 'push':
    default:
      return { zoom: 1.03 + 0.14 * out * k, x: 8 * plan.direction * e, y: 20 * e * -1, rot: 0.002 * Math.sin(p * 8) };
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

export function glowCircle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number,
): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(1, radius));
  gradient.addColorStop(0, rgba(color, alpha));
  gradient.addColorStop(0.45, rgba(color, alpha * 0.45));
  gradient.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
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
