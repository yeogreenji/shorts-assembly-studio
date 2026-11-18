import type { CameraPlan, CutScene, ScenePalette } from './scene';
import { rgba, shade } from './color';

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

const easeOut = (value: number) => 1 - (1 - value) ** 3;
const easeInOut = (value: number) => (value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2);

/** 컷 진행도(p)로 카메라 위치·배율·각도를 만듭니다. */
export function cameraAt(plan: CameraPlan, p: number, t: number): CamState {
  const k = plan.intensity;
  const e = easeInOut(Math.min(1, p));
  const out = easeOut(Math.min(1, p));
  switch (plan.move) {
    case 'pull':
      return { zoom: 1.16 - 0.14 * out * k, x: 0, y: -18 * e, rot: 0 };
    case 'punch':
      return { zoom: 1.02 + 0.2 * Math.exp(-3.6 * p) * k, x: 0, y: -10 * e, rot: 0.004 * Math.sin(p * 22) * k };
    case 'drift':
      return { zoom: 1.1, x: -78 * plan.direction * e * k, y: 10 * e, rot: 0.008 * plan.direction * e };
    case 'tilt':
      return { zoom: 1.08, x: 14 * e, y: 84 * e * k, rot: -0.01 * e };
    case 'shake':
      return {
        zoom: 1.09,
        x: Math.sin(t * 27) * 16 * k,
        y: Math.cos(t * 31) * 12 * k,
        rot: Math.sin(t * 19) * 0.012 * k,
      };
    case 'handheld':
      return {
        zoom: 1.06,
        x: Math.sin(t * 1.7) * 18 + Math.sin(t * 3.4) * 8,
        y: Math.cos(t * 2.1) * 14,
        rot: Math.sin(t * 1.4) * 0.008,
      };
    case 'pan':
      return { zoom: 1.14, x: 60 * plan.direction * Math.sin(e * Math.PI), y: 0, rot: 0.02 * plan.direction * e };
    case 'push':
    default:
      return { zoom: 1 + 0.13 * out * k, x: 0, y: 22 * e * -1, rot: 0 };
  }
}

/** 깊이별로 다른 속도로 움직이는 레이어. */
export function layer(
  ctx: CanvasRenderingContext2D,
  cam: CamState,
  depth: number,
  paint: () => void,
): void {
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

export interface RngLike {
  next: () => number;
  range: (min: number, max: number) => number;
  int: (min: number, max: number) => number;
  pick: <T>(list: readonly T[]) => T;
  chance: (probability: number) => boolean;
}

export function skyFill(ctx: CanvasRenderingContext2D, palette: ScenePalette, horizon = 0.72): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, STAGE_H * horizon);
  gradient.addColorStop(0, palette.skyTop);
  gradient.addColorStop(0.62, palette.skyBottom);
  gradient.addColorStop(1, palette.horizon);
  ctx.fillStyle = gradient;
  ctx.fillRect(-200, -200, STAGE_W + 400, STAGE_H * horizon + 300);
}

export function stars(ctx: CanvasRenderingContext2D, rng: RngLike, t: number, count: number, top: number, bottom: number, color = '#ffffff'): void {
  const total = Math.max(8, Math.round(count * quality.detail));
  for (let index = 0; index < total; index += 1) {
    const x = rng.range(-40, STAGE_W + 40);
    const y = rng.range(top, bottom);
    const size = rng.range(1.6, 4.6);
    const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(t * rng.range(0.5, 1.6) + index));
    ctx.fillStyle = rgba(color, 0.18 + twinkle * 0.5);
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, color: string, alpha: number): void {
  ctx.fillStyle = rgba(color, alpha);
  ctx.beginPath();
  ctx.ellipse(x, y, 120 * scale, 46 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 92 * scale, y + 10 * scale, 88 * scale, 36 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(x - 96 * scale, y + 14 * scale, 74 * scale, 30 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

interface BuildingsOptions {
  baseY: number;
  minHeight: number;
  maxHeight: number;
  count: number;
  color: string;
  windowColor?: string;
  windowAlpha?: number;
  rng: RngLike;
  alpha?: number;
}

export function buildings(ctx: CanvasRenderingContext2D, options: BuildingsOptions): void {
  const { baseY, minHeight, maxHeight, count, color, rng } = options;
  const gap = (STAGE_W + 200) / count;
  ctx.save();
  ctx.globalAlpha = options.alpha ?? 1;
  for (let index = 0; index < count; index += 1) {
    const width = gap * rng.range(0.62, 0.98);
    const height = rng.range(minHeight, maxHeight);
    const x = -100 + index * gap + rng.range(-10, 10);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, baseY - height, width, height + 240, 10);
    ctx.fill();
    if (options.windowColor) {
      const cols = Math.max(2, Math.floor((width / 46) * (0.55 + 0.45 * quality.detail)));
      const rows = Math.max(2, Math.floor((height / 62) * (0.55 + 0.45 * quality.detail)));
      for (let col = 0; col < cols; col += 1) {
        for (let row = 0; row < rows; row += 1) {
          if (rng.chance(0.42)) continue;
          ctx.fillStyle = rgba(options.windowColor, (options.windowAlpha ?? 0.6) * rng.range(0.5, 1));
          ctx.fillRect(x + 16 + col * 46, baseY - height + 26 + row * 62, 22, 30);
        }
      }
    }
  }
  ctx.restore();
}

function peopleSilhouette(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, color: string, alpha = 0.5): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y - 92 * scale, 26 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x - 30 * scale, y - 66 * scale, 60 * scale, 110 * scale, 24 * scale);
  ctx.fill();
  ctx.restore();
}

/** ── 도시 야경 ─────────────────────────────────────── */
function cityNight(ctx: CanvasRenderingContext2D, cut: CutScene, cam: CamState, t: number, rng: RngLike): void {
  layer(ctx, cam, 0.12, () => {
    skyFill(ctx, cut.palette);
    stars(ctx, rng, t, 46, 0, 900);
    glowCircle(ctx, 800, 300, 260, cut.palette.horizon, 0.4);
    ctx.fillStyle = rgba(cut.palette.horizon, 0.9);
    ctx.beginPath();
    ctx.arc(800, 300, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(cut.palette.skyTop, 0.9);
    ctx.beginPath();
    ctx.arc(830, 280, 62, 0, Math.PI * 2);
    ctx.fill();
  });
  layer(ctx, cam, 0.22, () => {
    buildings(ctx, { baseY: 1420, minHeight: 320, maxHeight: 700, count: 10, color: rgba(cut.palette.far, 0.85), windowColor: cut.palette.accent, windowAlpha: 0.35, rng });
  });
  layer(ctx, cam, 0.42, () => {
    buildings(ctx, { baseY: 1560, minHeight: 420, maxHeight: 900, count: 7, color: shade(cut.palette.near, 0.12), windowColor: cut.palette.glow, windowAlpha: 0.55, rng });
    ctx.fillStyle = rgba(cut.palette.accent, 0.16);
    ctx.fillRect(0, 1500, STAGE_W, 8);
    ctx.fillStyle = '#0a0a12';
    ctx.beginPath();
    ctx.roundRect(-100, 1600, STAGE_W + 200, 420, 0);
    ctx.fill();
    // 젖은 노면 반사
    for (let index = 0; index < 9; index += 1) {
      const x = rng.range(0, STAGE_W);
      const width = rng.range(24, 90);
      const gradient = ctx.createLinearGradient(x, 1600, x, 1900);
      gradient.addColorStop(0, rgba(cut.palette.accent, 0.24));
      gradient.addColorStop(1, rgba(cut.palette.accent, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 1600, width, 300);
    }
  });
  layer(ctx, cam, 0.8, () => {
    peopleSilhouette(ctx, 180 + Math.sin(t * 0.3) * 12, 1720, 1.1, '#05060d', 0.75);
    peopleSilhouette(ctx, 890 - Math.sin(t * 0.26) * 10, 1760, 1.25, '#05060d', 0.6);
  });
}

/** ── 노을 옥상 ─────────────────────────────────────── */
function rooftop(ctx: CanvasRenderingContext2D, cut: CutScene, cam: CamState, t: number, rng: RngLike): void {
  layer(ctx, cam, 0.1, () => {
    skyFill(ctx, cut.palette, 0.68);
    glowCircle(ctx, 560, 720, 460, cut.palette.horizon, 0.5);
    ctx.fillStyle = rgba('#fff1c9', 0.95);
    ctx.beginPath();
    ctx.arc(560, 720, 128, 0, Math.PI * 2);
    ctx.fill();
    for (let index = 0; index < 4; index += 1) {
      const x = ((index * 320 + t * 8) % 1300) - 120;
      cloud(ctx, x, 300 + index * 128, rng.range(0.5, 0.9), '#fff3dd', 0.22);
    }
  });
  layer(ctx, cam, 0.28, () => {
    buildings(ctx, { baseY: 1500, minHeight: 150, maxHeight: 380, count: 12, color: rgba(cut.palette.far, 0.75), rng });
    ctx.fillStyle = rgba('#3d3461', 0.55);
    ctx.beginPath();
    ctx.moveTo(-100, 1520);
    ctx.lineTo(1180, 1520);
    ctx.lineTo(1180, 1900);
    ctx.lineTo(-100, 1900);
    ctx.closePath();
    ctx.fill();
  });
  layer(ctx, cam, 0.62, () => {
    // 난간
    ctx.strokeStyle = rgba('#161022', 0.85);
    ctx.lineWidth = 16;
    ctx.beginPath();
    ctx.moveTo(-40, 1440);
    ctx.lineTo(1120, 1440);
    ctx.stroke();
    ctx.lineWidth = 10;
    for (let x = -20; x < 1120; x += 96) {
      ctx.beginPath();
      ctx.moveTo(x, 1440);
      ctx.lineTo(x, 1680);
      ctx.stroke();
    }
    // 물탱크
    ctx.fillStyle = rgba(cut.palette.near, 0.9);
    ctx.beginPath();
    ctx.roundRect(820, 1080, 230, 360, 24);
    ctx.fill();
    ctx.fillStyle = rgba('#000000', 0.18);
    ctx.beginPath();
    ctx.roundRect(846, 1104, 60, 312, 18);
    ctx.fill();
  });
  layer(ctx, cam, 0.86, () => {
    ctx.fillStyle = rgba(cut.palette.ink, 0.95);
    ctx.fillRect(-60, 1700, STAGE_W + 120, 320);
    for (let index = 0; index < 3; index += 1) {
      const bx = 160 + index * 320 + Math.sin(t * 0.6 + index) * 30;
      const by = 1180 - ((t * 12 + index * 90) % 260);
      ctx.strokeStyle = rgba('#2b2136', 0.9);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(bx - 26, by);
      ctx.quadraticCurveTo(bx, by - 18, bx + 26, by);
      ctx.stroke();
    }
  });
}

/** ── 사무실 ────────────────────────────────────────── */
function office(ctx: CanvasRenderingContext2D, cut: CutScene, cam: CamState, t: number, rng: RngLike): void {
  const pal = cut.palette;
  layer(ctx, cam, 0.1, () => {
    const wall = ctx.createLinearGradient(0, 0, 0, 1500);
    wall.addColorStop(0, shade(pal.ground, 0.06));
    wall.addColorStop(1, shade(pal.ground, -0.12));
    ctx.fillStyle = wall;
    ctx.fillRect(-100, -100, STAGE_W + 200, 1700);
    // 창밖
    ctx.fillStyle = shade(pal.ground, 0.18);
    ctx.beginPath();
    ctx.roundRect(70, 220, 470, 620, 12);
    ctx.fill();
    const outside = ctx.createLinearGradient(0, 220, 0, 840);
    outside.addColorStop(0, pal.skyTop);
    outside.addColorStop(1, pal.horizon);
    ctx.fillStyle = outside;
    ctx.beginPath();
    ctx.roundRect(86, 236, 438, 588, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(86, 236, 438, 588, 8);
    ctx.clip();
    buildings(ctx, { baseY: 850, minHeight: 120, maxHeight: 380, count: 6, color: rgba(pal.far, 0.9), windowColor: pal.accent, windowAlpha: 0.5, rng });
    ctx.restore();
    ctx.fillStyle = shade(pal.ground, 0.3);
    ctx.fillRect(298, 236, 14, 588);
    ctx.fillRect(86, 520, 438, 12);
    // 시계
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath();
    ctx.arc(920, 300, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(920, 300);
    ctx.lineTo(920, 250);
    ctx.moveTo(920, 300);
    ctx.lineTo(962, 316);
    ctx.stroke();
  });
  layer(ctx, cam, 0.36, () => {
    // 책상·모니터
    ctx.fillStyle = shade(pal.near, 0.24);
    ctx.beginPath();
    ctx.roundRect(-60, 1450, STAGE_W + 120, 260, 14);
    ctx.fill();
    ctx.fillStyle = rgba(pal.accent, 0.22 + Math.sin(t * 2) * 0.05);
    ctx.beginPath();
    ctx.roundRect(650, 1130, 380, 260, 16);
    ctx.fill();
    ctx.fillStyle = '#0b1220';
    ctx.beginPath();
    ctx.roundRect(666, 1146, 348, 228, 12);
    ctx.fill();
    for (let index = 0; index < 4; index += 1) {
      const height = 40 + ((index * 37 + t * 24) % 120);
      ctx.fillStyle = rgba(cut.palette.accent, 0.8);
      ctx.fillRect(700 + index * 74, 1340 - height, 42, height);
    }
    ctx.fillStyle = shade(pal.near, 0.32);
    ctx.fillRect(838, 1390, 34, 70);
    // 화분
    ctx.fillStyle = '#2f6b4f';
    for (let index = 0; index < 4; index += 1) {
      ctx.beginPath();
      ctx.ellipse(150 + index * 26, 1330 - index * 40, 46, 26, -0.5 + index * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.roundRect(110, 1360, 130, 110, 14);
    ctx.fill();
  });
  layer(ctx, cam, 0.18, () => {
    glowCircle(ctx, 540, 60, 420, cut.palette.glow, 0.18 + Math.sin(t * 1.4) * 0.03);
  });
}

/** ── 자취방 ────────────────────────────────────────── */
function cozyRoom(ctx: CanvasRenderingContext2D, cut: CutScene, cam: CamState, t: number, rng: RngLike): void {
  const pal = cut.palette;
  layer(ctx, cam, 0.1, () => {
    const wall = ctx.createLinearGradient(0, 0, 0, 1500);
    wall.addColorStop(0, shade(pal.ground, 0.1));
    wall.addColorStop(1, shade(pal.ground, -0.1));
    ctx.fillStyle = wall;
    ctx.fillRect(-100, -100, STAGE_W + 200, 1700);
    for (let x = 60; x < STAGE_W; x += 120) {
      ctx.fillStyle = rgba('#000000', 0.06);
      ctx.fillRect(x, 0, 3, 1460);
    }
    // 창문
    ctx.fillStyle = shade(pal.ground, 0.22);
    ctx.beginPath();
    ctx.roundRect(620, 260, 400, 500, 16);
    ctx.fill();
    const outside = ctx.createLinearGradient(0, 260, 0, 760);
    outside.addColorStop(0, pal.skyTop);
    outside.addColorStop(1, pal.horizon);
    ctx.fillStyle = outside;
    ctx.beginPath();
    ctx.roundRect(636, 276, 368, 468, 10);
    ctx.fill();
    ctx.fillStyle = shade(pal.ground, 0.34);
    ctx.fillRect(810, 276, 12, 468);
    // 커튼
    ctx.fillStyle = rgba(shade(pal.accent, -0.2), 0.55);
    ctx.beginPath();
    ctx.moveTo(596, 240);
    ctx.quadraticCurveTo(650, 500, 606, 790);
    ctx.lineTo(560, 790);
    ctx.lineTo(560, 240);
    ctx.closePath();
    ctx.fill();
    // 선반
    ctx.fillStyle = shade(pal.ground, 0.26);
    ctx.fillRect(70, 620, 380, 18);
    for (let index = 0; index < 5; index += 1) {
      const height = rng.range(50, 110);
      ctx.fillStyle = rng.pick(['#b91c1c', '#1d4ed8', '#15803d', '#c2410c', '#7e22ce']);
      ctx.beginPath();
      ctx.roundRect(92 + index * 68, 620 - height, 40, height, 6);
      ctx.fill();
    }
  });
  layer(ctx, cam, 0.42, () => {
    // 바닥·러그
    ctx.fillStyle = shade(pal.near, 0.16);
    ctx.fillRect(-60, 1470, STAGE_W + 120, 520);
    ctx.fillStyle = rgba(pal.accent, 0.22);
    ctx.beginPath();
    ctx.ellipse(540, 1740, 420, 130, 0, 0, Math.PI * 2);
    ctx.fill();
    // 스탠드
    ctx.strokeStyle = shade(pal.near, 0.3);
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(910, 1470);
    ctx.lineTo(910, 1080);
    ctx.stroke();
    ctx.fillStyle = shade(pal.accent, 0.12);
    ctx.beginPath();
    ctx.moveTo(860, 1080);
    ctx.lineTo(960, 1080);
    ctx.lineTo(986, 980);
    ctx.lineTo(834, 980);
    ctx.closePath();
    ctx.fill();
    glowCircle(ctx, 910, 1060, 300, pal.glow, 0.22 + Math.sin(t * 1.2) * 0.04);
    // 의자
    ctx.fillStyle = shade(pal.near, 0.26);
    ctx.beginPath();
    ctx.roundRect(700, 1360, 300, 160, 26);
    ctx.fill();
  });
  layer(ctx, cam, 0.76, () => {
    // 고양이 실루엣 (가끔)
    ctx.fillStyle = 'rgba(10,10,14,0.5)';
    ctx.beginPath();
    ctx.ellipse(210, 1730, 74, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(282, 1700, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(266, 1678);
    ctx.lineTo(272, 1656);
    ctx.lineTo(284, 1674);
    ctx.moveTo(292, 1674);
    ctx.lineTo(302, 1654);
    ctx.lineTo(306, 1678);
    ctx.fill();
  });
}

/** ── 카페 ──────────────────────────────────────────── */
function cafe(ctx: CanvasRenderingContext2D, cut: CutScene, cam: CamState, t: number, rng: RngLike): void {
  const pal = cut.palette;
  layer(ctx, cam, 0.1, () => {
    const wall = ctx.createLinearGradient(0, 0, 0, 1500);
    wall.addColorStop(0, shade(pal.ground, 0.12));
    wall.addColorStop(1, shade(pal.ground, -0.12));
    ctx.fillStyle = wall;
    ctx.fillRect(-100, -100, STAGE_W + 200, 1700);
    // 큰 창
    ctx.fillStyle = shade(pal.ground, 0.24);
    ctx.beginPath();
    ctx.roundRect(540, 200, 540, 720, 10);
    ctx.fill();
    const outside = ctx.createLinearGradient(0, 200, 0, 920);
    outside.addColorStop(0, pal.skyTop);
    outside.addColorStop(1, pal.horizon);
    ctx.fillStyle = outside;
    ctx.fillRect(556, 216, 508, 688);
    ctx.save();
    ctx.beginPath();
    ctx.rect(556, 216, 508, 688);
    ctx.clip();
    buildings(ctx, { baseY: 900, minHeight: 100, maxHeight: 300, count: 5, color: rgba(pal.far, 0.7), windowColor: pal.accent, windowAlpha: 0.4, rng });
    peopleSilhouette(ctx, 700 + Math.sin(t * 0.4) * 40, 900, 1.1, '#2b2118', 0.5);
    ctx.restore();
    // 메뉴판
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.roundRect(120, 300, 320, 380, 12);
    ctx.fill();
    ctx.strokeStyle = rgba('#f5d0a9', 0.5);
    ctx.lineWidth = 5;
    for (let index = 0; index < 5; index += 1) {
      ctx.beginPath();
      ctx.moveTo(160, 370 + index * 54);
      ctx.lineTo(160 + rng.range(150, 240), 370 + index * 54);
      ctx.stroke();
    }
    // 매다는 조명
    for (let index = 0; index < 3; index += 1) {
      const x = 300 + index * 240;
      ctx.strokeStyle = rgba('#000000', 0.5);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 180 + index * 30);
      ctx.stroke();
      ctx.fillStyle = shade(pal.accent, 0.2);
      ctx.beginPath();
      ctx.moveTo(x - 54, 240 + index * 30);
      ctx.lineTo(x + 54, 240 + index * 30);
      ctx.lineTo(x + 30, 180 + index * 30);
      ctx.lineTo(x - 30, 180 + index * 30);
      ctx.closePath();
      ctx.fill();
      glowCircle(ctx, x, 250 + index * 30, 190, pal.glow, 0.24 + Math.sin(t * 1.1 + index) * 0.04);
    }
  });
  layer(ctx, cam, 0.44, () => {
    ctx.fillStyle = shade(pal.near, 0.2);
    ctx.fillRect(-60, 1520, STAGE_W + 120, 460);
    ctx.strokeStyle = rgba('#000000', 0.25);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-40, 1560);
    ctx.lineTo(1120, 1560);
    ctx.stroke();
    // 테이블 위 컵
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(760, 1380, 120, 140, 16);
    ctx.fill();
    ctx.fillStyle = '#a16207';
    ctx.beginPath();
    ctx.roundRect(768, 1396, 104, 26, 8);
    ctx.fill();
    ctx.fillStyle = '#2f6b4f';
    ctx.beginPath();
    ctx.ellipse(220, 1400, 90, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b45309';
    ctx.beginPath();
    ctx.roundRect(170, 1430, 100, 100, 12);
    ctx.fill();
  });
}

/** ── 비 오는 거리 ──────────────────────────────────── */
function streetRain(ctx: CanvasRenderingContext2D, cut: CutScene, cam: CamState, t: number, rng: RngLike): void {
  const pal = cut.palette;
  layer(ctx, cam, 0.1, () => {
    skyFill(ctx, pal, 0.6);
    glowCircle(ctx, 300, 500, 380, pal.glow, 0.16);
  });
  layer(ctx, cam, 0.24, () => {
    buildings(ctx, { baseY: 1500, minHeight: 420, maxHeight: 820, count: 8, color: rgba(pal.far, 0.92), windowColor: pal.glow, windowAlpha: 0.28, rng });
    // 네온 간판
    const signs = [
      { x: 120, y: 900, w: 240, h: 90, color: '#ff4fd8' },
      { x: 760, y: 760, w: 200, h: 150, color: '#36f0d0' },
      { x: 430, y: 1080, w: 160, h: 70, color: '#ffd166' },
    ];
    for (const sign of signs) {
      const flicker = 0.65 + 0.35 * Math.abs(Math.sin(t * 3 + sign.x));
      glowCircle(ctx, sign.x + sign.w / 2, sign.y + sign.h / 2, sign.w * 1.1, sign.color, 0.22 * flicker);
      ctx.fillStyle = rgba(sign.color, 0.85 * flicker);
      ctx.beginPath();
      ctx.roundRect(sign.x, sign.y, sign.w, sign.h, 12);
      ctx.fill();
      ctx.fillStyle = rgba('#0b0b12', 0.55);
      ctx.fillRect(sign.x + 20, sign.y + 28, sign.w - 60, 12);
      ctx.fillRect(sign.x + 20, sign.y + 54, sign.w - 90, 10);
    }
  });
  layer(ctx, cam, 0.5, () => {
    ctx.fillStyle = shade(pal.near, 0.08);
    ctx.fillRect(-60, 1560, STAGE_W + 120, 420);
    // 노면 반사
    for (const sign of [
      { x: 160, color: '#ff4fd8' },
      { x: 820, color: '#36f0d0' },
      { x: 470, color: '#ffd166' },
    ]) {
      const gradient = ctx.createLinearGradient(sign.x, 1560, sign.x, 1920);
      gradient.addColorStop(0, rgba(sign.color, 0.34));
      gradient.addColorStop(1, rgba(sign.color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(sign.x - 30, 1560, 150, 360);
    }
    ctx.strokeStyle = rgba('#000000', 0.35);
    ctx.lineWidth = 8;
    for (let index = 0; index < 4; index += 1) {
      ctx.beginPath();
      ctx.moveTo(120 + index * 260, 1560);
      ctx.lineTo(60 + index * 300, 1920);
      ctx.stroke();
    }
  });
  layer(ctx, cam, 0.82, () => {
    // 가로등
    ctx.strokeStyle = shade(pal.near, 0.24);
    ctx.lineWidth = 18;
    ctx.beginPath();
    ctx.moveTo(940, 1900);
    ctx.lineTo(940, 900);
    ctx.quadraticCurveTo(940, 840, 880, 840);
    ctx.stroke();
    glowCircle(ctx, 860, 860, 200, '#ffe4a0', 0.3);
  });
}

/** ── 네온 테크 ─────────────────────────────────────── */
function neonGrid(ctx: CanvasRenderingContext2D, cut: CutScene, cam: CamState, t: number, rng: RngLike): void {
  const pal = cut.palette;
  layer(ctx, cam, 0.1, () => {
    const gradient = ctx.createLinearGradient(0, 0, 0, STAGE_H);
    gradient.addColorStop(0, pal.skyTop);
    gradient.addColorStop(0.55, shade(pal.skyBottom, -0.15));
    gradient.addColorStop(1, '#05030d');
    ctx.fillStyle = gradient;
    ctx.fillRect(-100, -100, STAGE_W + 200, STAGE_H + 200);
    glowCircle(ctx, 540, 1180, 620, pal.glow, 0.28);
    stars(ctx, rng, t, 40, 0, 900);
  });
  layer(ctx, cam, 0.3, () => {
    const horizon = 1180;
    ctx.strokeStyle = rgba(pal.accent, 0.55);
    ctx.lineWidth = 4;
    // 원근 그리드
    for (let index = 0; index < 14; index += 1) {
      const x = 540 + (index - 7) * 150;
      ctx.beginPath();
      ctx.moveTo(540, horizon);
      ctx.lineTo(x * 2.6 - 540, STAGE_H + 200);
      ctx.stroke();
    }
    for (let index = 1; index < 12; index += 1) {
      const p = index / 12;
      const y = horizon + (STAGE_H - horizon) * p ** 2.1;
      ctx.globalAlpha = 0.5 - p * 0.35;
      ctx.beginPath();
      ctx.moveTo(-200, y);
      ctx.lineTo(STAGE_W + 200, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 떠 있는 패널
    for (let index = 0; index < 4; index += 1) {
      const x = 120 + index * 250;
      const y = 320 + Math.sin(t * 0.7 + index * 1.3) * 40 + index * 40;
      ctx.fillStyle = rgba(pal.accent, 0.12);
      ctx.strokeStyle = rgba(pal.accent, 0.5);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x, y, 190, 120, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = rgba(pal.accent, 0.5);
      ctx.fillRect(x + 18, y + 26, 90, 8);
      ctx.fillRect(x + 18, y + 48, 60, 8);
    }
  });
  layer(ctx, cam, 0.55, () => {
    ctx.strokeStyle = rgba(pal.accent, 0.2);
    ctx.lineWidth = 2;
    for (let y = 0; y < STAGE_H; y += 6) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(STAGE_W, y);
      ctx.stroke();
    }
  });
}

/** ── 낮 공원 ───────────────────────────────────────── */
function parkDay(ctx: CanvasRenderingContext2D, cut: CutScene, cam: CamState, t: number, rng: RngLike): void {
  const pal = cut.palette;
  layer(ctx, cam, 0.1, () => {
    skyFill(ctx, pal, 0.62);
    glowCircle(ctx, 820, 320, 380, '#fff8dc', 0.5);
    ctx.fillStyle = rgba('#fff8dc', 0.95);
    ctx.beginPath();
    ctx.arc(820, 320, 96, 0, Math.PI * 2);
    ctx.fill();
    for (let index = 0; index < 3; index += 1) {
      const x = ((index * 420 + t * 10) % 1400) - 150;
      cloud(ctx, x, 260 + index * 150, rng.range(0.6, 1.1), '#ffffff', 0.5);
    }
  });
  layer(ctx, cam, 0.26, () => {
    ctx.fillStyle = rgba(shade(pal.far, 0.12), 0.9);
    ctx.beginPath();
    ctx.moveTo(-100, 1420);
    ctx.quadraticCurveTo(280, 1160, 700, 1400);
    ctx.quadraticCurveTo(960, 1300, 1180, 1420);
    ctx.lineTo(1180, 1920);
    ctx.lineTo(-100, 1920);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(pal.ground, 0.08);
    ctx.beginPath();
    ctx.moveTo(-100, 1560);
    ctx.quadraticCurveTo(420, 1400, 1180, 1600);
    ctx.lineTo(1180, 1920);
    ctx.lineTo(-100, 1920);
    ctx.closePath();
    ctx.fill();
  });
  layer(ctx, cam, 0.6, () => {
    for (const [x, scale] of [
      [180, 1],
      [880, 1.2],
    ] as const) {
      ctx.fillStyle = '#6b4b2a';
      ctx.beginPath();
      ctx.roundRect(x - 22 * scale, 1300, 44 * scale, 280 * scale, 10);
      ctx.fill();
      ctx.fillStyle = '#3f7d46';
      for (let index = 0; index < 4; index += 1) {
        ctx.beginPath();
        ctx.ellipse(x + Math.sin(index * 2) * 70 * scale, 1240 - index * 40 * scale, 130 * scale, 86 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // 벤치
    ctx.fillStyle = '#8a5a33';
    ctx.fillRect(660, 1520, 320, 26);
    ctx.fillRect(660, 1470, 320, 22);
    ctx.fillStyle = '#4b3220';
    ctx.fillRect(680, 1546, 22, 90);
    ctx.fillRect(940, 1546, 22, 90);
  });
  layer(ctx, cam, 0.85, () => {
    ctx.fillStyle = rgba('#233018', 0.5);
    ctx.beginPath();
    ctx.ellipse(540, 1900, 700, 120, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** ── 지하철 ────────────────────────────────────────── */
function subway(ctx: CanvasRenderingContext2D, cut: CutScene, cam: CamState, t: number, _rng: RngLike): void {
  const pal = cut.palette;
  layer(ctx, cam, 0.1, () => {
    const wall = ctx.createLinearGradient(0, 0, 0, 1920);
    wall.addColorStop(0, shade(pal.ground, 0.18));
    wall.addColorStop(0.6, shade(pal.ground, 0.04));
    wall.addColorStop(1, shade(pal.near, 0.06));
    ctx.fillStyle = wall;
    ctx.fillRect(-100, -100, STAGE_W + 200, 2100);
    // 창문 띠
    ctx.fillStyle = '#0a1020';
    ctx.fillRect(0, 420, STAGE_W, 380);
    for (let index = 0; index < 3; index += 1) {
      const x = -200 + ((t * 420 + index * 420) % 1500);
      const gradient = ctx.createLinearGradient(x, 0, x + 320, 0);
      gradient.addColorStop(0, rgba(pal.accent, 0));
      gradient.addColorStop(0.5, rgba(pal.accent, 0.4));
      gradient.addColorStop(1, rgba(pal.accent, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(x, 440, 320, 340);
    }
    // 천장 조명
    for (let index = 0; index < 4; index += 1) {
      ctx.fillStyle = rgba('#f8fafc', 0.85);
      ctx.fillRect(90 + index * 250, 120, 150, 26);
      glowCircle(ctx, 165 + index * 250, 150, 220, '#dbeafe', 0.16);
    }
    // 손잡이 봉
    ctx.strokeStyle = shade(pal.far, 0.3);
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.moveTo(-40, 330);
    ctx.lineTo(1120, 330);
    ctx.stroke();
    for (let index = 0; index < 6; index += 1) {
      const x = 60 + index * 170;
      ctx.strokeStyle = rgba(shade(pal.far, 0.2), 0.9);
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x, 330);
      ctx.lineTo(x, 430);
      ctx.stroke();
      ctx.fillStyle = rgba('#f8fafc', 0.85);
      ctx.beginPath();
      ctx.roundRect(x - 26, 430, 52, 16, 8);
      ctx.fill();
    }
  });
  layer(ctx, cam, 0.4, () => {
    // 좌석
    ctx.fillStyle = shade(pal.accent, -0.35);
    ctx.beginPath();
    ctx.roundRect(-60, 1300, STAGE_W + 120, 220, 26);
    ctx.fill();
    for (let index = 0; index < 7; index += 1) {
      ctx.fillStyle = rgba('#000000', 0.14);
      ctx.fillRect(40 + index * 150, 1300, 8, 200);
    }
    ctx.fillStyle = shade(pal.near, 0.2);
    ctx.fillRect(-60, 1620, STAGE_W + 120, 320);
    // 기둥
    ctx.fillStyle = shade(pal.far, 0.16);
    ctx.fillRect(880, 300, 40, 1360);
  });
  layer(ctx, cam, 0.8, () => {
    peopleSilhouette(ctx, 150, 1500, 1.3, '#0a0d18', 0.45);
    peopleSilhouette(ctx, 980, 1560, 1.1, '#0a0d18', 0.35);
  });
}

export function drawWorld(ctx: CanvasRenderingContext2D, cut: CutScene, cam: CamState, t: number, rng: RngLike): void {
  switch (cut.world) {
    case 'city-night':
      cityNight(ctx, cut, cam, t, rng);
      return;
    case 'sunset-rooftop':
      rooftop(ctx, cut, cam, t, rng);
      return;
    case 'office':
      office(ctx, cut, cam, t, rng);
      return;
    case 'cozy-room':
      cozyRoom(ctx, cut, cam, t, rng);
      return;
    case 'cafe':
      cafe(ctx, cut, cam, t, rng);
      return;
    case 'street-rain':
      streetRain(ctx, cut, cam, t, rng);
      return;
    case 'neon-grid':
      neonGrid(ctx, cut, cam, t, rng);
      return;
    case 'park-day':
      parkDay(ctx, cut, cam, t, rng);
      return;
    case 'subway':
    default:
      subway(ctx, cut, cam, t, rng);
  }
}

/** 장면 앞쪽에 놓는 소품 — 인물과 배경 사이에 두어 깊이를 만듭니다. */
export function drawProps(ctx: CanvasRenderingContext2D, cut: CutScene, cam: CamState, t: number, rng: RngLike): void {
  const depth = 0.66;
  layer(ctx, cam, depth, () => {
    const pal = cut.palette;
    for (let index = 0; index < cut.props.length; index += 1) {
      const prop = cut.props[index];
      const x = index % 2 === 0 ? 140 + rng.range(-20, 40) : 900 + rng.range(-40, 20);
      const y = 1340 + rng.range(-30, 50);
      ctx.save();
      ctx.translate(x, y);
      const bob = Math.sin(t * 1.3 + index * 1.7) * 8;
      ctx.translate(0, bob);
      ctx.scale(0.78, 0.78);
      switch (prop) {
        case 'money': {
          ctx.fillStyle = '#86efac';
          ctx.strokeStyle = '#14532d';
          ctx.lineWidth = 4;
          for (let note = 0; note < 3; note += 1) {
            ctx.save();
            ctx.translate(note * 16, -note * 22);
            ctx.rotate(-0.16 + note * 0.12);
            ctx.beginPath();
            ctx.roundRect(-70, -34, 140, 68, 8);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
          break;
        }
        case 'cup': {
          ctx.fillStyle = '#f8fafc';
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.roundRect(-52, -70, 104, 120, 14);
          ctx.fill();
          ctx.stroke();
          break;
        }
        case 'laptop': {
          ctx.fillStyle = '#1f2937';
          ctx.beginPath();
          ctx.roundRect(-110, -60, 220, 130, 10);
          ctx.fill();
          ctx.fillStyle = rgba(pal.accent, 0.7);
          ctx.fillRect(-94, -44, 188, 92);
          break;
        }
        case 'clock': {
          ctx.fillStyle = '#f8fafc';
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.arc(0, 0, 66, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -40);
          ctx.moveTo(0, 0);
          ctx.lineTo(32, 14);
          ctx.stroke();
          break;
        }
        case 'plant': {
          ctx.fillStyle = '#b45309';
          ctx.beginPath();
          ctx.roundRect(-46, -20, 92, 90, 10);
          ctx.fill();
          ctx.fillStyle = '#3f7d46';
          for (let leaf = 0; leaf < 5; leaf += 1) {
            ctx.beginPath();
            ctx.ellipse(Math.sin(leaf * 1.7) * 44, -70 - leaf * 26, 40, 24, leaf * 0.6 - 0.6, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'cat': {
          ctx.fillStyle = '#111827';
          ctx.beginPath();
          ctx.ellipse(0, 0, 78, 44, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(-56, -46, 32, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(-78, -66);
          ctx.lineTo(-70, -100);
          ctx.lineTo(-52, -70);
          ctx.moveTo(-40, -70);
          ctx.lineTo(-24, -98);
          ctx.lineTo(-16, -64);
          ctx.fill();
          break;
        }
        case 'bag': {
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.roundRect(-70, -50, 140, 130, 12);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(0, -50, 34, Math.PI, 0);
          ctx.stroke();
          break;
        }
        case 'chart': {
          ctx.fillStyle = rgba('#0f172a', 0.85);
          ctx.beginPath();
          ctx.roundRect(-110, -80, 220, 160, 12);
          ctx.fill();
          for (let bar = 0; bar < 4; bar += 1) {
            const height = 40 + ((bar * 33 + t * 30) % 90);
            ctx.fillStyle = pal.accent;
            ctx.fillRect(-88 + bar * 46, 56 - height, 30, height);
          }
          break;
        }
        case 'heart': {
          ctx.fillStyle = rgba('#fb7185', 0.9);
          ctx.beginPath();
          ctx.moveTo(0, 30);
          ctx.bezierCurveTo(-70, -30, -30, -90, 0, -50);
          ctx.bezierCurveTo(30, -90, 70, -30, 0, 30);
          ctx.fill();
          break;
        }
        case 'book': {
          ctx.fillStyle = '#1d4ed8';
          ctx.beginPath();
          ctx.roundRect(-80, -56, 160, 116, 8);
          ctx.fill();
          ctx.fillStyle = '#f8fafc';
          ctx.fillRect(-60, -36, 120, 76);
          break;
        }
        case 'umbrella': {
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.moveTo(0, 40);
          ctx.lineTo(0, -40);
          ctx.stroke();
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.arc(0, -40, 90, Math.PI, 0);
          ctx.fill();
          break;
        }
        case 'food': {
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.ellipse(0, 0, 90, 50, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.ellipse(0, -14, 56, 26, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'trophy': {
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.moveTo(-50, -80);
          ctx.lineTo(50, -80);
          ctx.quadraticCurveTo(50, 20, 0, 30);
          ctx.quadraticCurveTo(-50, 20, -50, -80);
          ctx.fill();
          ctx.fillRect(-30, 30, 60, 40);
          ctx.fillRect(-52, 66, 104, 18);
          break;
        }
        default:
          break;
      }
      ctx.restore();
    }
  });
}
