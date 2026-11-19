import type { CutScene } from './scene';
import { STAGE_H, STAGE_W, glowCircle, type CamState } from './stage';
import { createRng } from './rng';
import { rgba } from './color';

/**
 * "살아 있는 그림" — 한 장의 일러스트를 그대로 미는 대신,
 * 그림을 잘게 나눠 아주 조금씩 어긋나게 그립니다(2.5D 워프).
 *
 *  · 얼굴(초점)은 거의 고정 — 눈·입이 흔들리면 사진 티가 나기 때문
 *  · 머리카락·옷자락·배경은 초점 주변 가우시안만큼 크게 흔들림
 *  · 컷마다 위상이 달라 같은 그림도 다시 찍은 것처럼 보입니다
 * 미리보기와 영상 녹화가 이 함수 하나를 같이 씁니다.
 */

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 워프 격자 — 가로로 촘촘히, 세로는 3단. 이음매는 겹쳐 그려 숨깁니다. */
const COLS = 14;
const ROWS = 3;
const OVERLAP = 30;

export interface LivingResult {
  zoom: number;
  /** 화면 안에서 그림이 실제로 움직인 최대 폭(스테이지 px) */
  warp: number;
}

export function drawLivingArt(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  cut: CutScene,
  cam: CamState,
  p: number,
  t: number,
  scale: number,
): LivingResult {
  const focus = cut.art.focus;
  // 컷에 들어올 때 살짝 당겨 들어오는 느낌(오버슈트) — 정지 화면과 가장 크게 갈리는 지점.
  const entry = 1.05 + 0.1 * Math.exp(-9 * Math.max(0, p)) * Math.min(1.6, scale);
  const zoom = Math.max(1.075, cam.zoom * entry);
  const scaledW = STAGE_W * zoom;
  const scaledH = STAGE_H * zoom;
  const marginX = Math.max(0, (scaledW - STAGE_W) / 2 - 2);
  const marginY = Math.max(0, (scaledH - STAGE_H) / 2 - 2);
  const panX = clamp(cam.x, -marginX, marginX);
  const panY = clamp(cam.y, -marginY, marginY);
  const tx = clamp(STAGE_W / 2 - focus.x * scaledW + panX, STAGE_W - scaledW, 0);
  const ty = clamp(STAGE_H / 2 - focus.y * scaledH + panY, STAGE_H - scaledH, 0);

  const ratioX = image.naturalWidth / scaledW;
  const ratioY = image.naturalHeight / scaledH;
  const fx = focus.x * STAGE_W;
  const fy = focus.y * STAGE_H;

  // 배경은 잔잔하게, 초점 주변(인물)은 조금 더 크게 — 사진이 아니라 숨 쉬는 느낌.
  const bgAmp = 1.8 + 2.6 * scale;
  const subAmp = 4 + 7 * scale;

  const field = (x: number, y: number): [number, number] => {
    const g = Math.exp(-(((x - fx) / 580) ** 2 + ((y - fy) / 660) ** 2));
    const sway = Math.sin(t * 1.05 + x * 0.0034 + y * 0.0012) + 0.5 * Math.sin(t * 1.85 + x * 0.0078);
    // 인물(초점)은 카메라가 움직이는 반대로 조금 늦게 따라옵니다 — 깊이(2.5D)가 생기는 부분.
    const depthX = -cam.x * 0.11 * g;
    const depthY = -cam.y * 0.11 * g;
    const dx =
      depthX +
      bgAmp * 0.5 * sway +
      subAmp * g * (0.72 * Math.sin(t * 1.32 + 0.6) + 0.28 * Math.sin(t * 2.4 + x * 0.004));
    const dy =
      depthY +
      bgAmp * (0.55 * Math.cos(t * 0.82 + x * 0.0038) + 0.3 * Math.sin(t * 1.55 + y * 0.0028)) +
      subAmp * g * 0.7 * Math.cos(t * 1.08 + 0.4);
    return [dx, dy];
  };

  const colW = STAGE_W / COLS;
  const rowH = STAGE_H / ROWS;
  const destW = colW + OVERLAP;
  const destH = rowH + OVERLAP;
  let peak = 0;

  ctx.save();
  ctx.translate(STAGE_W / 2, STAGE_H / 2);
  ctx.rotate(cam.rot);
  ctx.translate(-STAGE_W / 2, -STAGE_H / 2);
  ctx.imageSmoothingEnabled = true;
  try {
    ctx.imageSmoothingQuality = 'high';
  } catch {
    /* 구형 브라우저 */
  }
  for (let col = 0; col < COLS; col += 1) {
    const x0 = col * colW;
    for (let row = 0; row < ROWS; row += 1) {
      const y0 = row * rowH;
      const [dx, dy] = field(x0 + colW / 2, y0 + rowH / 2);
      peak = Math.max(peak, Math.abs(dx), Math.abs(dy));
      const sx = clamp((x0 - tx) * ratioX, 0, image.naturalWidth);
      const sy = clamp((y0 - ty) * ratioY, 0, image.naturalHeight);
      const sw = Math.min(destW * ratioX, image.naturalWidth - sx);
      const sh = Math.min(destH * ratioY, image.naturalHeight - sy);
      if (sw <= 0 || sh <= 0) continue;
      ctx.drawImage(image, sx, sy, sw, sh, x0 + dx, y0 + dy, destW, destH);
    }
  }
  ctx.restore();
  return { zoom, warp: peak };
}

/**
 * 컷 진입 연출 — 화이트 플래시 + 화면을 가로지르는 스피드 스트릭.
 * "딱" 끊기는 컷이 아니라, 영상처럼 휙 넘어온 느낌을 만듭니다.
 */
export function drawEntryBurst(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  cut: CutScene,
  local: number,
  scale: number,
  index: number,
): void {
  const span = 0.24 + 0.06 * Math.min(1.6, scale);
  if (local > span) return;
  const k = 1 - local / span;
  const eased = k * k;
  const accent = cut.palette.accent;

  // 화이트 플래시
  ctx.fillStyle = rgba('#ffffff', 0.4 * eased * Math.min(1.4, 0.7 + 0.5 * scale));
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);

  // 스피드 스트릭 — 컷 방향으로 쓸고 지나갑니다.
  const dir = index % 2 === 0 ? 1 : -1;
  const rng = createRng(`burst#${index}#${cut.art.id}`);
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const travel = (1 - eased) * STAGE_W * 1.15;
  for (let line = 0; line < 14; line += 1) {
    const y = rng.range(-100, STAGE_H + 100);
    const h = rng.range(3, 16) * (0.5 + scale * 0.5);
    const x = dir > 0 ? -STAGE_W * 0.5 + travel + rng.range(0, 220) : STAGE_W * 1.5 - travel - rng.range(0, 220);
    const width = rng.range(360, 900);
    const gradient = ctx.createLinearGradient(x, y, x + dir * width, y);
    gradient.addColorStop(0, rgba(accent, 0));
    gradient.addColorStop(0.5, rgba('#ffffff', 0.35 * eased));
    gradient.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(dir > 0 ? x : x - width, y, width, h);
  }
  ctx.restore();

  // 줌 스미어 — 아주 짧은 순간, 화면을 살짝 확대해 겹쳐 그려 '빠르게 들어왔다'는 느낌을 더합니다.
  if (local < 0.12 && canvas.width > 8) {
    const previous = ctx.getTransform();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.26 * (1 - local / 0.12);
    const grow = 0.045;
    const w = canvas.width;
    const h = canvas.height;
    ctx.drawImage(
      canvas,
      -w * grow * 0.5,
      -h * grow * 0.5,
      w * (1 + grow),
      h * (1 + grow),
    );
    ctx.globalAlpha = 1;
    ctx.setTransform(previous);
  }
}

/**
 * 글리치 슬라이스 — 충격 컷에서 화면 일부가 어긋나며 지나갑니다.
 * 캔버스 자신을 잘라 옮겨 그리므로 추가 비용이 거의 없습니다.
 */
export function drawGlitchSlices(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  local: number,
  scale: number,
  index: number,
): void {
  const span = 0.13;
  if (local > span || canvas.width < 8) return;
  const k = 1 - local / span;
  const rng = createRng(`glitch#${index}#${Math.floor(local * 90)}`);
  const deviceScale = canvas.width / STAGE_W;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let slice = 0; slice < 3; slice += 1) {
    const sy = Math.floor(rng.range(0.1, 0.7) * canvas.height);
    const sh = Math.max(6, Math.floor(canvas.height * rng.range(0.02, 0.05)));
    const dx = Math.round(rng.range(-1, 1) * 70 * k * scale * deviceScale);
    if (dx === 0) continue;
    ctx.globalAlpha = 0.5 + 0.4 * k;
    ctx.drawImage(canvas, 0, sy, canvas.width, sh, dx, sy, canvas.width, sh);
  }
  ctx.restore();
  ctx.setTransform(deviceScale, 0, 0, canvas.height / STAGE_H, 0, 0);
}

/**
 * 광원(빛 번짐)이 카메라와 반대로 흐르는 레이어 — 화면이 살아 있는 느낌의 핵심.
 */
export function drawLightLeaks(
  ctx: CanvasRenderingContext2D,
  cut: CutScene,
  cam: CamState,
  t: number,
  scale: number,
): void {
  const pal = cut.palette;
  const speed = 0.16 + 0.1 * scale;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let index = 0; index < 3; index += 1) {
    const phase = t * speed + index * 2.1;
    const x = STAGE_W * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(phase))) - cam.x * 0.35;
    const y = STAGE_H * (0.18 + 0.5 * (0.5 + 0.5 * Math.cos(phase * 0.8))) - cam.y * 0.3;
    const radius = 380 + index * 150 + 60 * Math.sin(phase * 1.4);
    const alpha = (0.1 + 0.07 * Math.sin(phase * 1.9)) * (0.7 + 0.5 * cut.light);
    glowCircle(ctx, x, y, radius, index === 1 ? '#ffffff' : pal.glow, Math.max(0, alpha));
    glowCircle(ctx, x, y, radius * 0.6, pal.accent, Math.max(0, alpha * 0.22));
  }
  ctx.restore();
}

/** 비트에 맞춰 화면이 살짝 밝아지는 펄스(0~1) — 자막 강조 타이밍과 같습니다. */
export function beatFlash(local: number, duration: number): number {
  const p = local / Math.max(0.2, duration);
  let total = 0;
  for (const beat of [0.16, 0.48, 0.8]) {
    const d = (p - beat) / 0.06;
    if (Math.abs(d) < 3) total += Math.exp(-d * d * 1.6);
  }
  return Math.min(1, total);
}
