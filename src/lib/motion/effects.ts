import type { CutScene, EffectId } from './scene';
import { rgba, shade } from './color';
import { STAGE_H, STAGE_W, glowCircle, layer, quality, type CamState, type RngLike } from './stage';

/** 컷마다 다른 파티클 — 비·눈·돈·하트·반짝임·집중선. */

function drift(t: number, speed: number, offset: number, span: number): number {
  return ((t * speed + offset) % span) - span * 0.25;
}

function sparkleShape(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(size * 0.4 + alpha);
  ctx.fillStyle = rgba(color, alpha);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * 0.22, -size * 0.22, size, 0);
  ctx.quadraticCurveTo(size * 0.22, size * 0.22, 0, size);
  ctx.quadraticCurveTo(-size * 0.22, size * 0.22, -size, 0);
  ctx.quadraticCurveTo(-size * 0.22, -size * 0.22, 0, -size);
  ctx.fill();
  ctx.restore();
}

function noteShape(ctx: CanvasRenderingContext2D, x: number, y: number, rotation: number, scale: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(scale, scale);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 7;
  const paper = ctx.createLinearGradient(-60, -30, 50, 30);
  paper.addColorStop(0, '#dcfce7');
  paper.addColorStop(0.42, color);
  paper.addColorStop(1, '#15803d');
  ctx.fillStyle = paper;
  ctx.beginPath();
  ctx.roundRect(-60, -29, 120, 58, 6);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(12, 62, 38, 0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();
  // 접힌 자국
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(0, -27);
  ctx.lineTo(0, 27);
  ctx.stroke();
  // 초상 자리
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.beginPath();
  ctx.ellipse(-28, 0, 12, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(6, 58, 34, 0.85)';
  ctx.font = '800 20px Pretendard, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('₩', 24, 1);
  ctx.restore();
}

function coinShape(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, spin: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(Math.max(0.25, Math.abs(Math.cos(spin))), 1);
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 14;
  const gold = ctx.createLinearGradient(-radius, -radius, radius, radius);
  gold.addColorStop(0, '#fff6c2');
  gold.addColorStop(0.45, '#fbbf24');
  gold.addColorStop(1, '#b45309');
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(120, 63, 4, 0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.beginPath();
  ctx.ellipse(-radius * 0.3, -radius * 0.35, radius * 0.32, radius * 0.2, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function heartShape(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha: number, rotation = 0): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.9);
  ctx.bezierCurveTo(-size * 1.7, -size * 0.4, -size * 0.8, -size * 1.5, 0, -size * 0.5);
  ctx.bezierCurveTo(size * 0.8, -size * 1.5, size * 1.7, -size * 0.4, 0, size * 0.9);
  ctx.fill();
  ctx.restore();
}

function boltShape(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + size * 0.1, y - size);
  ctx.lineTo(x - size * 0.5, y + size * 0.12);
  ctx.lineTo(x - size * 0.05, y + size * 0.12);
  ctx.lineTo(x - size * 0.22, y + size);
  ctx.lineTo(x + size * 0.55, y - size * 0.18);
  ctx.lineTo(x + size * 0.05, y - size * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** 세부 묘사 수준에 맞춘 파티클 개수 */
const count = (base: number) => Math.max(6, Math.round(base * quality.detail));

/** 인물 뒤에서 흐르는 공기·날씨. scale은 모션 강도(0.6~1.6). */
export function drawAmbient(
  ctx: CanvasRenderingContext2D,
  cut: CutScene,
  cam: CamState,
  t: number,
  rng: RngLike,
  scale = 1,
): void {
  const pal = cut.palette;
  const weather = cut.weather;
  const boost = 0.82 + 0.32 * scale;
  const density = Math.min(1.5, 0.85 + 0.32 * scale);
  layer(ctx, cam, 0.5, () => {
    if (weather.includes('rain')) {
      ctx.strokeStyle = rgba('#cfe9ff', 0.34);
      ctx.lineWidth = 3;
      for (let index = 0; index < count(76 * density); index += 1) {
        const x = rng.range(-100, STAGE_W + 100);
        const speed = rng.range(900, 1500) * boost;
        const length = rng.range(40, 90);
        const y = drift(t, speed, rng.range(0, 2200), 2200);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - length * 0.22, y + length);
        ctx.stroke();
      }
    }
    if (weather.includes('snow')) {
      for (let index = 0; index < count(54 * density); index += 1) {
        const baseX = rng.range(0, STAGE_W);
        const speed = rng.range(40, 110) * boost;
        const size = rng.range(3, 9);
        const y = drift(t, speed, rng.range(0, 2100), 2100);
        const x = baseX + Math.sin(t * 0.8 + index) * 30;
        ctx.fillStyle = rgba('#ffffff', 0.55);
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (weather.includes('petals')) {
      const colors = ['#ffc7d8', '#ffd9e6', '#f9b8cf', '#ffe9d6'];
      for (let index = 0; index < count(34 * density); index += 1) {
        const baseX = rng.range(-60, STAGE_W + 60);
        const speed = rng.range(70, 180) * boost;
        const y = drift(t, speed, rng.range(0, 2200), 2200);
        const x = baseX + Math.sin(t * 1.1 + index * 0.7) * 70;
        const size = rng.range(7, 14);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * 1.5 + index);
        ctx.globalAlpha = 0.55 + 0.3 * Math.abs(Math.sin(t * 1.3 + index));
        ctx.fillStyle = colors[index % colors.length] ?? '#ffc7d8';
        ctx.beginPath();
        ctx.ellipse(0, 0, size, size * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    if (weather.includes('bokeh')) {
      for (let index = 0; index < count(9 * density); index += 1) {
        const x = rng.range(0, STAGE_W);
        const y = rng.range(200, 1500);
        const radius = rng.range(60, 180);
        const alpha = 0.07 + 0.06 * Math.sin(t * 0.9 * boost + index);
        glowCircle(ctx, x, y + Math.sin(t * 0.6 * boost + index) * 26, radius, pal.accent, alpha);
      }
    }
  });
}

/** 화면 앞쪽 효과 — 집중선·반짝임·돈비·하트·색종이. scale은 모션 강도. */
export function drawForeground(
  ctx: CanvasRenderingContext2D,
  cut: CutScene,
  cam: CamState,
  t: number,
  rng: RngLike,
  scale = 1,
): void {
  const pal = cut.palette;
  const effects = cut.effects.filter((effect) => effect !== 'rain' && effect !== 'snow' && effect !== 'petals');
  const boost = 0.8 + 0.35 * scale;
  const density = Math.min(1.55, 0.85 + 0.35 * scale);

  layer(ctx, cam, 0.55, () => {
    if (effects.includes('speedlines')) {
      const pulse = 0.55 + 0.45 * Math.sin(t * 5.2 * boost);
      ctx.save();
      ctx.translate(STAGE_W / 2, STAGE_H * 0.42);
      ctx.strokeStyle = rgba(pal.accent, 0.13 * pulse);
      ctx.lineWidth = 9;
      for (let index = 0; index < 30; index += 1) {
        const angle = (index / 30) * Math.PI * 2 + t * 0.12 * boost;
        const inner = 560 + rng.range(0, 60);
        const outer = 1200 + rng.range(0, 300);
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner * 1.15);
        ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer * 1.15);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (effects.includes('bolt')) {
      const flash = Math.max(0, Math.sin(t * 7.5 * boost));
      if (flash > 0.55) {
        glowCircle(ctx, 540, 900, 720, pal.accent, 0.12 * flash);
      }
      boltShape(ctx, 860, 520, 120, pal.accent, 0.85 * (0.6 + 0.4 * Math.sin(t * 9)));
    }
  });

  layer(ctx, cam, 0.78, () => {
    if (effects.includes('light')) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let index = 0; index < 5; index += 1) {
        const angle = -0.5 + index * 0.26 + Math.sin(t * 0.4 + index) * 0.04;
        const x0 = STAGE_W * 0.42 + Math.cos(angle) * 220;
        const length = 1700;
        const drift0 = Math.sin(angle) * length;
        const gradient = ctx.createLinearGradient(x0, 0, x0 + drift0, length);
        gradient.addColorStop(0, rgba(pal.accent, 0.2 * (0.6 + 0.4 * Math.sin(t * 0.8 + index))));
        gradient.addColorStop(1, rgba(pal.accent, 0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(x0 - 34, 0);
        ctx.lineTo(x0 + 34, 0);
        ctx.lineTo(x0 + drift0 + 210, length);
        ctx.lineTo(x0 + drift0 - 210, length);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    if (effects.includes('shards')) {
      for (let index = 0; index < count(14 * density); index += 1) {
        const x = rng.range(60, STAGE_W - 60);
        const speed = rng.range(200, 460) * boost;
        const y = drift(t, speed, rng.range(0, 2200), 2200);
        const size = rng.range(9, 22);
        ctx.save();
        ctx.translate(x + Math.sin(t * 2 + index) * 30, y);
        ctx.rotate(t * 2.4 + index);
        ctx.fillStyle = rgba(index % 3 === 0 ? '#ffffff' : pal.accent, 0.55 + 0.35 * Math.sin(t * 3 + index));
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.lineTo(size * 0.42, 0);
        ctx.lineTo(0, size);
        ctx.lineTo(-size * 0.42, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    if (effects.includes('dust')) {
      for (let index = 0; index < count(42 * density); index += 1) {
        const x = rng.range(0, STAGE_W);
        const speed = rng.range(18, 52) * boost;
        const y = STAGE_H - drift(t, speed, rng.range(0, 2400), 2400);
        const size = rng.range(2, 6);
        ctx.fillStyle = rgba('#fff6d8', 0.3 + 0.3 * Math.sin(t * 2 + index));
        ctx.beginPath();
        ctx.arc(x + Math.sin(t * 0.9 + index) * 18, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (effects.includes('sparkle')) {
      for (let index = 0; index < count(12 * density); index += 1) {
        const x = rng.range(40, STAGE_W - 40);
        const y = rng.range(120, 1500);
        const size = rng.range(8, 24);
        const phase = rng.range(0, 6.28);
        const alpha = 0.42 + 0.5 * Math.abs(Math.sin(t * 2.4 * boost + phase));
        sparkleShape(ctx, x, y + Math.sin(t * 1.4 + phase) * 12, size, index % 3 === 0 ? '#ffffff' : pal.accent, alpha);
      }
    }
    if (effects.includes('money')) {
      for (let index = 0; index < 7; index += 1) {
        const x = rng.range(0, STAGE_W);
        const speed = rng.range(150, 330) * boost;
        const y = drift(t, speed, rng.range(0, 2200), 2200);
        const sway = x + Math.sin(t * 1.4 + index) * 26;
        // 얼굴(화면 가운데)은 비워 두고 양옆으로만 내립니다 — 지폐가 눈을 가리지 않게.
        if (sway > STAGE_W * 0.3 && sway < STAGE_W * 0.7) continue;
        if (index % 3 === 0) {
          coinShape(ctx, sway, y, rng.range(12, 19), t * 2.6 + index);
        } else {
          noteShape(ctx, sway, y, Math.sin(t * 1.1 + index) * 0.5, rng.range(0.55, 0.78), '#4ade80');
        }
      }
    }
    if (effects.includes('heart')) {
      for (let index = 0; index < count(14 * density); index += 1) {
        const x = rng.range(60, STAGE_W - 60);
        const speed = rng.range(80, 180) * boost;
        const y = STAGE_H - drift(t, speed, rng.range(0, 2200), 2200);
        heartShape(ctx, x + Math.sin(t * 1.2 + index) * 30, y, rng.range(14, 30), index % 3 === 0 ? '#fda4af' : '#fb7185', 0.7, Math.sin(t + index) * 0.3);
      }
    }
    if (effects.includes('confetti')) {
      const colors = [pal.accent, '#fb7185', '#60a5fa', '#facc15', '#34d399'];
      for (let index = 0; index < count(34 * density); index += 1) {
        const x = rng.range(0, STAGE_W);
        const speed = rng.range(180, 420) * boost;
        const y = drift(t, speed, rng.range(0, 2300), 2300);
        ctx.save();
        ctx.translate(x + Math.sin(t * 2 + index) * 22, y);
        ctx.rotate(t * 3 + index);
        ctx.fillStyle = rgba(colors[index % colors.length] ?? pal.accent, 0.78);
        ctx.fillRect(-6, -11, 12, 22);
        ctx.restore();
      }
    }
    if (effects.includes('steam')) {
      for (let index = 0; index < 6; index += 1) {
        const progress = ((t * 0.4 + index * 0.17) % 1);
        const x = 900 + Math.sin(t + index) * 26;
        const y = 1520 - progress * 420;
        const radius = 30 + progress * 90;
        glowCircle(ctx, x, y, radius, shade(pal.glow, 0.2), 0.22 * (1 - progress));
      }
    }
    if (effects.includes('anger')) {
      // 인물 머리 옆 화난 표시는 캐릭터가 그립니다. 여기서는 붉은 기운만.
      glowCircle(ctx, 540, 1000, 500, '#ef4444', 0.06 + 0.03 * Math.sin(t * 4));
    }
    if (effects.includes('sweat')) {
      glowCircle(ctx, 700, 760, 200, '#7dd3fc', 0.1);
    }
  });
}

/** 컷 전환·강조용 빛 번짐 — 화면을 천천히 가로지르는 빛. */
export function drawLightSweep(ctx: CanvasRenderingContext2D, cut: CutScene, t: number, duration: number): void {
  const p = Math.min(1, t / Math.max(0.2, duration));
  const pal = cut.palette;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const alpha = 0.16 * Math.sin(p * Math.PI) * cut.light;
  const travel = -STAGE_W * 0.6 + ((t * 340) % (STAGE_W * 2));
  const narrow = ctx.createLinearGradient(travel, 0, travel + STAGE_W * 0.55, STAGE_H);
  narrow.addColorStop(0, rgba(pal.glow, 0));
  narrow.addColorStop(0.45, rgba(pal.glow, 0.1 * cut.light));
  narrow.addColorStop(1, rgba(pal.glow, 0));
  ctx.fillStyle = narrow;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  const gradient = ctx.createLinearGradient(-200, 0, STAGE_W + 400, STAGE_H * 0.6);
  gradient.addColorStop(0, rgba(pal.glow, 0));
  gradient.addColorStop(0.5, rgba(pal.glow, alpha));
  gradient.addColorStop(1, rgba(pal.glow, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, STAGE_W, STAGE_H);
  ctx.restore();
}

export function effectNames(cut: CutScene): EffectId[] {
  return [...cut.effects, ...cut.weather];
}
