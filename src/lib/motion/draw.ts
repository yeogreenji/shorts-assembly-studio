import type { ScenePlan } from './scene';
import { createRng } from './rng';
import { rgba } from './color';
import { STAGE_H, STAGE_W, cameraAt, glowCircle, quality, type CamState } from './stage';
import { getArt } from './artLoader';
import { drawAmbient, drawForeground, drawLightSweep } from './effects';
import { drawCaption, drawHud } from './captions';

export interface RenderOptions {
  captions?: boolean;
  hud?: boolean;
  /** 특정 컷만 그릴 때 */
  cutIndex?: number;
  cutTime?: number;
}

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

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 그림이 아직 안 왔을 때 — 일러스트 대표색 그라데이션으로 먼저 채웁니다. */
function drawBackdrop(ctx: CanvasRenderingContext2D, top: string, mid: string, bottom: string, drift: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, STAGE_H);
  gradient.addColorStop(0, top);
  gradient.addColorStop(0.48, mid);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  // 로딩 중에도 정지 화면처럼 보이지 않게 아주 느린 빛의 이동
  const sweep = ctx.createLinearGradient(STAGE_W * (drift - 0.4), 0, STAGE_W * (drift + 0.4), STAGE_H);
  sweep.addColorStop(0, rgba('#ffffff', 0));
  sweep.addColorStop(0.5, rgba('#ffffff', 0.05));
  sweep.addColorStop(1, rgba('#ffffff', 0));
  ctx.fillStyle = sweep;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
}

/**
 * 일러스트 한 장을 카메라(켄 번즈)에 맞춰 그립니다.
 * 초점(얼굴)이 화면 밖으로 밀리지 않도록 이동 범위를 clamp해서,
 * 확대·패닝·회전을 해도 그림 가장자리가 드러나지 않습니다.
 */
function drawArtFrame(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  cut: ScenePlan['cuts'][number],
  cam: CamState,
  p: number,
): void {
  const focus = cut.art.focus;
  // 컷 진입 직후 살짝 당겨 들어오는 느낌
  const entry = 1.035 + 0.05 * Math.exp(-9 * p);
  const zoom = Math.max(1.02, cam.zoom * entry);
  const scaledW = STAGE_W * zoom;
  const scaledH = STAGE_H * zoom;
  const panX = clamp(cam.x, -160, 160);
  const panY = clamp(cam.y, -160, 160);
  const tx = clamp(STAGE_W / 2 - focus.x * scaledW + panX, STAGE_W - scaledW, 0);
  const ty = clamp(STAGE_H / 2 - focus.y * scaledH + panY, STAGE_H - scaledH, 0);

  ctx.save();
  ctx.translate(STAGE_W / 2, STAGE_H / 2);
  ctx.rotate(cam.rot);
  ctx.translate(-STAGE_W / 2, -STAGE_H / 2);
  try {
    ctx.filter = 'saturate(1.06) contrast(1.03)';
  } catch {
    /* 필터를 지원하지 않는 브라우저 */
  }
  ctx.drawImage(image, tx, ty, scaledW, scaledH);
  ctx.filter = 'none';
  ctx.restore();
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

  // 인물 쪽에서 번지는 빛
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  glowCircle(ctx, focusX, focusY, 780, pal.glow, 0.1 * strength * cut.light);
  glowCircle(ctx, focusX, focusY - 120, 320, '#ffffff', 0.05 * strength);
  ctx.restore();

  // 위에서 내려오는 빛줄기
  const shaft = ctx.createLinearGradient(STAGE_W * 0.18, 0, STAGE_W * 0.72, STAGE_H);
  shaft.addColorStop(0, rgba(pal.accent, 0.16 * strength * (0.6 + 0.3 * Math.sin(local * 0.9))));
  shaft.addColorStop(0.45, rgba(pal.accent, 0.03 * strength));
  shaft.addColorStop(1, rgba(pal.ink, 0));
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = shaft;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  ctx.restore();

  // 아래쪽은 색을 눌러 자막이 읽히게
  const bottom = ctx.createLinearGradient(0, STAGE_H * 0.58, 0, STAGE_H);
  bottom.addColorStop(0, rgba(pal.ink, 0));
  bottom.addColorStop(1, rgba(pal.ink, 0.62));
  ctx.fillStyle = bottom;
  ctx.fillRect(0, STAGE_H * 0.58, STAGE_W, STAGE_H * 0.42);
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
      gradient.addColorStop(0.66, 'rgba(0,0,0,0.14)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.5)');
      surfaceCtx.fillStyle = gradient;
      surfaceCtx.fillRect(0, 0, surface.width, surface.height);
    }
    cache.vignette = { canvas: surface, width: canvas.width, height: canvas.height };
  }
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.drawImage(cache.vignette.canvas, 0, 0, STAGE_W, STAGE_H);
  ctx.restore();
  // 상단·하단을 살짝 눌러 라벨과 자막이 읽히게
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
  ctx.globalAlpha = 0.42 + flicker * 0.16;
  ctx.fillStyle = cache.grain;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  ctx.restore();
}

/** 컷 전환 — 짧은 화이트 플래시 + 좌우로 스치는 빛. */
function drawTransition(ctx: CanvasRenderingContext2D, local: number, p: number, accent: string): void {
  if (local < 0.2) {
    const k = 1 - local / 0.2;
    ctx.fillStyle = rgba('#ffffff', 0.34 * k * k);
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const x = STAGE_W * (1 - p * 3.2);
    const streak = ctx.createLinearGradient(x - 260, 0, x + 260, 0);
    streak.addColorStop(0, rgba(accent, 0));
    streak.addColorStop(0.5, rgba(accent, 0.3 * k));
    streak.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = streak;
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    ctx.restore();
  }
}

/**
 * 한 프레임을 그립니다. 플레이어와 영상 녹화가 같은 함수를 씁니다.
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

  // 미리보기 캔버스가 작으면 묘사를 줄여 30fps를 지킵니다(영상 녹화는 항상 최대 품질).
  quality.detail = canvas.width < 460 ? 0.5 : 1;
  const scaleX = canvas.width / STAGE_W;
  const scaleY = canvas.height / STAGE_H;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, STAGE_W, STAGE_H);
  ctx.imageSmoothingQuality = 'high';

  const duration = Math.max(0.2, shot.duration);
  const p = Math.min(1, Math.max(0, local / duration));
  const cam: CamState = cameraAt(cut.camera, p, local);
  const rng = createRng(`${plan.seed}#${index}#frame`);
  const speaking = local < duration * 0.78;

  // 1) 배경(로딩 중 대표색 → 일러스트)
  drawBackdrop(ctx, cut.palette.top, cut.palette.mid, cut.palette.bottom, (local * 0.24) % 1.6);
  const image = getArt(cut.art.id);
  if (image) drawArtFrame(ctx, image, cut, cam, p);

  // 2) 색 보정·빛
  drawGrade(ctx, cut, local, image ? 1 : 0.45);

  // 3) 공기(비·눈·꽃잎·보케) → 앞쪽 효과(집중선·돈비·하트·색종이·반짝임)
  drawAmbient(ctx, cut, cam, local, rng);
  drawForeground(ctx, cut, cam, local, rng);
  drawLightSweep(ctx, cut, local, duration);

  // 4) 컷 전환
  drawTransition(ctx, local, p, cut.palette.accent);

  // 5) 화면 마감
  drawVignette(ctx, canvas, cut.palette.accent, 0.95);
  if (quality.detail >= 1) drawGrain(ctx, canvas, Math.sin(local * 9));

  if (options.captions !== false) {
    drawCaption(ctx, shot.subtitle, {
      accent: cut.palette.accent,
      fontSize: 84,
      maxWidth: 860,
      centerX: STAGE_W / 2,
      bottom: STAGE_H - 260,
      elapsed: local,
    });
  }
  if (options.hud) {
    drawHud(ctx, {
      banner: plan.banner,
      index,
      count: plan.cuts.length,
      progress: p,
      accent: cut.palette.accent,
      fontScale: 1,
    });
  }
  void speaking;
}

/** 대표 이미지 한 장 — 카드·미리보기 썸네일용. */
export function renderStill(canvas: HTMLCanvasElement, plan: ScenePlan, index: number, at = 0.4): void {
  const duration = plan.shots[index]?.duration ?? 3;
  renderFrame(canvas, plan, 0, { cutIndex: index, cutTime: duration * at, captions: false, hud: false });
}
