import type { ScenePlan } from './scene';
import { createRng } from './rng';
import { rgba } from './color';
import { STAGE_H, STAGE_W, cameraAt, glowCircle, motionScale, quality, type CamState, type MotionLevel } from './stage';
import { getArt } from './artLoader';
import { drawAmbient, drawForeground, drawLightSweep } from './effects';
import { drawCaption, drawHud } from './captions';
import { beatFlash, drawEntryBurst, drawGlitchSlices, drawLightLeaks, drawLivingArt } from './live';

export interface RenderOptions {
  captions?: boolean;
  hud?: boolean;
  /** 모션 강도 — 미리보기와 영상 녹화가 같은 값을 넘깁니다. */
  motion?: MotionLevel | number;
  /** 특정 컷만 그릴 때 */
  cutIndex?: number;
  cutTime?: number;
}

/** 이번 프레임의 카메라·워프 수치 — E2E가 "정말 움직이는지"를 숫자로 확인합니다. */
export interface FrameProbe {
  time: number;
  index: number;
  zoom: number;
  x: number;
  y: number;
  rot: number;
  warp: number;
  energy: number;
  scale: number;
}

export const frameProbe: FrameProbe = { time: 0, index: 0, zoom: 1, x: 0, y: 0, rot: 0, warp: 0, energy: 0, scale: 1 };

declare global {
  interface Window {
    __shortcutFrame?: FrameProbe;
  }
}

if (typeof window !== 'undefined') window.__shortcutFrame = frameProbe;

interface FrameCache {
  grain?: CanvasPattern | null;
  vignette?: { canvas: HTMLCanvasElement; width: number; height: number };
}

const cacheMap = new WeakMap<HTMLCanvasElement, FrameCache>();

function frameCache(canvas: HTMLCanvasElement): FrameCache {
  let cache = cacheMap.get(canvas);
  if (!cache) {
    cache = {};
    cacheMap.set(canvas, cache);
  }
  return cache;
}

function makeGrain(): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  tile.width = 160;
  tile.height = 160;
  const ctx = tile.getContext('2d');
  if (ctx) {
    const image = ctx.createImageData(160, 160);
    for (let index = 0; index < image.data.length; index += 4) {
      const value = 120 + Math.random() * 135;
      image.data[index] = value;
      image.data[index + 1] = value;
      image.data[index + 2] = value;
      image.data[index + 3] = 22;
    }
    ctx.putImageData(image, 0, 0);
  }
  return tile;
}

function findCut(plan: ScenePlan, time: number): { index: number; local: number } {
  const cuts = plan.cuts;
  if (cuts.length === 0) return { index: 0, local: 0 };
  for (let index = cuts.length - 1; index >= 0; index -= 1) {
    const start = plan.starts[index] ?? 0;
    if (time >= start) {
      const duration = plan.shots[index]?.duration ?? 3;
      return { index, local: Math.min(time - start, duration) };
    }
  }
  return { index: 0, local: Math.max(0, time) };
}

/** 그림이 아직 안 왔을 때 — 대표색 그라데이션도 천천히 흐르게. */
function drawBackdrop(ctx: CanvasRenderingContext2D, top: string, mid: string, bottom: string, drift: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, STAGE_H);
  gradient.addColorStop(0, top);
  gradient.addColorStop(0.48, mid);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  const x = Math.sin(drift * 1.5) * STAGE_W * 0.3 + STAGE_W * 0.5;
  glowCircle(ctx, x, STAGE_H * (0.35 + 0.1 * Math.cos(drift)), 760, '#ffffff', 0.06);
}

/** 일러스트 위에 얹는 색 보정·빛 — 같은 그림도 컷마다 다른 결이 되게. */
function drawGrade(
  ctx: CanvasRenderingContext2D,
  cut: ScenePlan['cuts'][number],
  local: number,
  strength: number,
): void {
  const pal = cut.palette;
  const focusX = cut.art.focus.x * STAGE_W;
  const focusY = cut.art.focus.y * STAGE_H;

  // 인물 쪽에서 번지는 빛 — 숨 쉬듯 커졌다 작아집니다.
  const breathe = 1 + 0.12 * Math.sin(local * 1.6);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  glowCircle(ctx, focusX, focusY, 780 * breathe, pal.glow, 0.085 * strength * cut.light);
  glowCircle(ctx, focusX, focusY - 120, 320 * breathe, '#ffffff', 0.04 * strength);
  ctx.restore();

  // 위에서 내려오는 빛줄기 — 각도가 아주 느리게 흔들립니다.
  const sway = Math.sin(local * 0.7) * 0.06;
  const shaft = ctx.createLinearGradient(
    STAGE_W * (0.16 + sway),
    0,
    STAGE_W * (0.74 + sway),
    STAGE_H,
  );
  shaft.addColorStop(0, rgba(pal.accent, 0.13 * strength * (0.6 + 0.35 * Math.sin(local * 0.9))));
  shaft.addColorStop(0.45, rgba(pal.accent, 0.04 * strength));
  shaft.addColorStop(1, rgba(pal.ink, 0));
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = shaft;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  ctx.restore();

  // 아래쪽은 색을 눌러 자막이 읽히게
  const bottom = ctx.createLinearGradient(0, STAGE_H * 0.55, 0, STAGE_H);
  bottom.addColorStop(0, rgba(pal.ink, 0));
  bottom.addColorStop(1, rgba(pal.ink, 0.6));
  ctx.fillStyle = bottom;
  ctx.fillRect(0, STAGE_H * 0.55, STAGE_W, STAGE_H * 0.45);
}

function drawVignette(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, accent: string, strength: number): void {
  const cache = frameCache(canvas);
  if (!cache.vignette || cache.vignette.width !== canvas.width || cache.vignette.height !== canvas.height) {
    const surface = document.createElement('canvas');
    surface.width = Math.max(2, Math.floor(canvas.width / 2));
    surface.height = Math.max(2, Math.floor(canvas.height / 2));
    const surfaceCtx = surface.getContext('2d');
    if (surfaceCtx) {
      const gradient = surfaceCtx.createRadialGradient(
        surface.width / 2,
        surface.height * 0.45,
        surface.width * 0.2,
        surface.width / 2,
        surface.height * 0.52,
        surface.width * 0.86,
      );
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(0.66, 'rgba(0,0,0,0.12)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.46)');
      surfaceCtx.fillStyle = gradient;
      surfaceCtx.fillRect(0, 0, surface.width, surface.height);
    }
    cache.vignette = { canvas: surface, width: canvas.width, height: canvas.height };
  }
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.drawImage(cache.vignette.canvas, 0, 0, STAGE_W, STAGE_H);
  ctx.restore();
  const top = ctx.createLinearGradient(0, 0, 0, 280);
  top.addColorStop(0, rgba('#000000', 0.46));
  top.addColorStop(1, rgba('#000000', 0));
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, STAGE_W, 280);
  glowCircle(ctx, STAGE_W / 2, STAGE_H * 1.04, 620, accent, 0.07);
}

function drawGrain(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, flicker: number): void {
  const cache = frameCache(canvas);
  if (cache.grain === undefined) {
    cache.grain = ctx.createPattern(makeGrain(), 'repeat');
  }
  if (!cache.grain) return;
  ctx.save();
  ctx.globalAlpha = 0.4 + flicker * 0.16;
  ctx.fillStyle = cache.grain;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  ctx.restore();
}

/**
 * 한 프레임을 그립니다. 플레이어와 영상 녹화가 같은 함수·같은 옵션을 씁니다.
 * canvas의 픽셀 크기에 맞춰 1080×1920 좌표계로 자동 변환합니다.
 */
export function renderFrame(canvas: HTMLCanvasElement, plan: ScenePlan, time: number, options: RenderOptions = {}): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { index, local } =
    options.cutIndex !== undefined ? { index: options.cutIndex, local: options.cutTime ?? 0 } : findCut(plan, time);
  const cut = plan.cuts[index];
  const shot = plan.shots[index];
  if (!cut || !shot) return;

  const scale = motionScale(options.motion);
  // 묘사량은 미리보기·영상이 같게 유지합니다(프레임을 지키는 건 캔버스 해상도 쪽에서).
  quality.detail = canvas.width < 280 ? 0.6 : 1;

  const scaleX = canvas.width / STAGE_W;
  const scaleY = canvas.height / STAGE_H;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, STAGE_W, STAGE_H);
  ctx.imageSmoothingQuality = 'high';

  const duration = Math.max(0.2, shot.duration);
  const p = Math.min(1, Math.max(0, local / duration));
  const cam: CamState = cameraAt(cut.camera, p, local, scale);
  const rng = createRng(`${plan.seed}#${index}#frame`);

  // 이번 프레임 수치를 남겨 둡니다(검증용).
  frameProbe.time = time;
  frameProbe.index = index;
  frameProbe.zoom = cam.zoom;
  frameProbe.x = cam.x;
  frameProbe.y = cam.y;
  frameProbe.rot = cam.rot;
  frameProbe.energy = cam.energy;
  frameProbe.scale = scale;

  // 1) 배경 → 살아 있는 일러스트
  drawBackdrop(ctx, cut.palette.top, cut.palette.mid, cut.palette.bottom, local * 0.5);
  const image = getArt(cut.art.id);
  if (image) {
    const living = drawLivingArt(ctx, image, cut, cam, p, local, scale);
    frameProbe.warp = living.warp;
    frameProbe.zoom = living.zoom;
  } else {
    frameProbe.warp = 0;
  }

  // 2) 색 보정·빛 번짐 — 빛이 흐르고, 비트마다 화면이 살짝 밝아집니다.
  drawGrade(ctx, cut, local, image ? 1 : 0.45);
  drawLightLeaks(ctx, cut, cam, local, scale);
  const flash = beatFlash(local, duration);
  if (flash > 0.02) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = rgba(cut.palette.accent, 0.075 * flash * Math.min(1.5, scale));
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    ctx.restore();
  }

  // 3) 공기(비·눈·꽃잎·보케) → 앞쪽 효과(집중선·돈비·하트·색종이·반짝임)
  drawAmbient(ctx, cut, cam, local, rng, scale);
  drawForeground(ctx, cut, cam, local, rng, scale);
  drawLightSweep(ctx, cut, local, duration);

  // 4) 컷 전환 — 플래시·스트릭·글리치 (영상처럼 휙 넘어오게)
  drawEntryBurst(ctx, canvas, cut, local, scale * Math.min(1.3, cam.energy), index);
  if (cam.energy > 1.1 && scale > 0.8) drawGlitchSlices(ctx, canvas, local, scale, index);

  // 5) 화면 마감
  drawVignette(ctx, canvas, cut.palette.accent, 0.95);
  if (quality.detail >= 0.85) drawGrain(ctx, canvas, Math.sin(local * 9));

  // 6) 자막·HUD — 영상에도 똑같이 구워집니다.
  if (options.captions !== false) {
    const plain = shot.subtitle.replace(/\*/g, '').trim();
    drawCaption(ctx, shot.subtitle, {
      accent: cut.palette.accent,
      fontSize: 84,
      maxWidth: 860,
      centerX: STAGE_W / 2,
      bottom: STAGE_H - 268,
      elapsed: local,
      duration,
      bubble: shot.role === 'cta' && plain.length <= 22,
    });
  }
  if (options.hud !== false) {
    drawHud(ctx, {
      banner: plan.banner,
      index,
      count: plan.cuts.length,
      progress: p,
      accent: cut.palette.accent,
      fontScale: 1,
      elapsed: local,
    });
  }
}

/** 대표 이미지 한 장 — 카드·미리보기 썸네일용. */
export function renderStill(canvas: HTMLCanvasElement, plan: ScenePlan, index: number, at = 0.4): void {
  const duration = plan.shots[index]?.duration ?? 3;
  renderFrame(canvas, plan, 0, { cutIndex: index, cutTime: duration * at, captions: false, hud: false });
}
