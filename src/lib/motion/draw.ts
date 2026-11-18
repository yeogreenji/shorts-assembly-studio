import type { ScenePlan } from './scene';
import { createRng } from './rng';
import { rgba } from './color';
import { STAGE_H, STAGE_W, cameraAt, drawProps, drawWorld, glowCircle, quality, type CamState } from './worlds';
import { drawCharacter, drawCharacterGlow } from './character';
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
      image.data[index + 3] = 26;
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
        surface.width * 0.16,
        surface.width / 2,
        surface.height * 0.5,
        surface.width * 0.82,
      );
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(0.62, 'rgba(0,0,0,0.18)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.62)');
      surfaceCtx.fillStyle = gradient;
      surfaceCtx.fillRect(0, 0, surface.width, surface.height);
    }
    cache.vignette = { canvas: surface, width: canvas.width, height: canvas.height };
  }
  ctx.save();
  ctx.globalAlpha = strength;
  ctx.drawImage(cache.vignette.canvas, 0, 0, STAGE_W, STAGE_H);
  ctx.restore();
  // 위·아래를 살짝 눌러 자막과 라벨이 읽히게
  const top = ctx.createLinearGradient(0, 0, 0, 260);
  top.addColorStop(0, rgba('#000000', 0.5));
  top.addColorStop(1, rgba('#000000', 0));
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, STAGE_W, 260);
  const bottom = ctx.createLinearGradient(0, STAGE_H - 520, 0, STAGE_H);
  bottom.addColorStop(0, rgba('#000000', 0));
  bottom.addColorStop(1, rgba('#000000', 0.72));
  ctx.fillStyle = bottom;
  ctx.fillRect(0, STAGE_H - 520, STAGE_W, 520);
  glowCircle(ctx, STAGE_W / 2, STAGE_H * 1.02, 620, accent, 0.08);
}

function drawGrain(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, flicker: number): void {
  const cache = frameCache(canvas);
  if (cache.grain === undefined) {
    cache.grain = ctx.createPattern(makeGrain(), 'repeat');
  }
  if (!cache.grain) return;
  ctx.save();
  ctx.globalAlpha = 0.5 + flicker * 0.2;
  ctx.fillStyle = cache.grain;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  ctx.restore();
}

/**
 * 한 프레임을 그립니다. 플레이어와 영상 녹화가 같은 함수를 씁니다.
 * canvas의 픽셀 크기에 맞춰 1080×1920 좌표계로 자동 변환합니다.
 */
export function renderFrame(canvas: HTMLCanvasElement, plan: ScenePlan, time: number, options: RenderOptions = {}): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { index, local } = options.cutIndex !== undefined ? { index: options.cutIndex, local: options.cutTime ?? 0 } : findCut(plan, time);
  const cut = plan.cuts[index];
  const shot = plan.shots[index];
  if (!cut || !shot) return;

  // 미리보기 캔버스가 작으면 묘사를 줄여 30fps를 지킵니다(영상 녹화는 항상 최대 품질).
  quality.detail = canvas.width < 460 ? 0.5 : 1;
  const scaleX = canvas.width / STAGE_W;
  const scaleY = canvas.height / STAGE_H;
  ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  ctx.clearRect(0, 0, STAGE_W, STAGE_H);

  const duration = Math.max(0.2, shot.duration);
  const p = Math.min(1, Math.max(0, local / duration));
  const cam: CamState = cameraAt(cut.camera, p, local);
  const rng = createRng(`${plan.seed}#${index}#frame`);
  const speaking = local < duration * 0.78;

  // 배경
  drawWorld(ctx, cut, cam, local, rng);
  drawProps(ctx, cut, cam, local, rng);
  drawAmbient(ctx, cut, cam, local, rng);

  // 인물 — 배경과 분리되도록 어두운 후광을 먼저 깔고 빛을 얹습니다
  drawCharacterGlow(ctx, cut.hero, cut.palette.ink, 0.5);
  drawCharacterGlow(ctx, cut.hero, cut.palette.glow, 0.4);
  if (cut.rival) drawCharacterGlow(ctx, cut.rival, cut.palette.accent, 0.22);
  drawCharacter(ctx, cut.hero, local, speaking, cut.palette.glow);
  if (cut.rival) {
    // 두 사람 버전은 서로 마주 보게
    drawCharacter(ctx, cut.rival, local + 0.6, false, cut.palette.accent);
  }

  drawForeground(ctx, cut, cam, local, rng);
  drawLightSweep(ctx, cut, local, duration);

  // 컷 진입 플래시
  if (local < 0.16) {
    ctx.fillStyle = rgba('#ffffff', 0.42 * (1 - local / 0.16));
    ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  }

  const indoor = cut.world === 'office' || cut.world === 'cozy-room' || cut.world === 'cafe';
  drawVignette(ctx, canvas, cut.palette.accent, indoor ? 0.82 : 1);
  if (quality.detail >= 1) drawGrain(ctx, canvas, Math.sin(local * 9));

  if (options.captions !== false) {
    drawCaption(ctx, shot.subtitle, {
      accent: cut.palette.accent,
      fontSize: 84,
      maxWidth: 900,
      centerX: STAGE_W / 2,
      bottom: STAGE_H - 210,
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
}

/** 대표 이미지 한 장 — 카드·미리보기 썸네일용. */
export function renderStill(canvas: HTMLCanvasElement, plan: ScenePlan, index: number, at = 0.4): void {
  const duration = plan.shots[index]?.duration ?? 3;
  renderFrame(canvas, plan, 0, { cutIndex: index, cutTime: duration * at, captions: false, hud: false });
}
