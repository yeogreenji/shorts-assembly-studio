import { rgba } from './color';
import { captionTokens } from '../text';
import type { BrandCorner, CaptionTheme } from '../../types';

export interface CaptionWord {
  text: string;
  highlighted: boolean;
}

/** *별표* 표시를 단어 단위로 나눠 강조 여부를 유지합니다. */
export function splitWords(input: string): CaptionWord[] {
  // 화면과 같은 규칙으로 나눕니다 — 강조 단어 뒤의 쉼표·마침표가 따로 떨어지지 않게.
  return captionTokens(input)
    .filter((token) => token.text !== ' ')
    .map((token) => ({ text: token.text, highlighted: token.highlighted }));
}

export function captionFont(size: number): string {
  return `900 ${size}px Pretendard, "Pretendard Variable", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif`;
}

interface WrapResult {
  lines: CaptionWord[][];
}

export function wrapWords(ctx: CanvasRenderingContext2D, words: CaptionWord[], maxWidth: number): WrapResult {
  const lines: CaptionWord[][] = [];
  let current: CaptionWord[] = [];
  let width = 0;
  const space = ctx.measureText(' ').width;
  for (const word of words) {
    const wordWidth = ctx.measureText(word.text).width;
    const next = current.length === 0 ? wordWidth : width + space + wordWidth;
    if (next > maxWidth && current.length > 0) {
      lines.push(current);
      current = [word];
      width = wordWidth;
    } else {
      current.push(word);
      width = next;
    }
  }
  if (current.length) lines.push(current);
  return { lines };
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
/** 살짝 지나쳤다 돌아오는 팝 — 숏츠 자막의 '탁' 하고 박히는 느낌. */
const backOut = (value: number) => 1 + 2.2 * (value - 1) ** 3 + 1.35 * (value - 1) ** 2;

/**
 * 숏츠 자막 — 캔버스에 그대로 구워 미리보기와 내보낸 영상이 100% 같습니다.
 *  · 단어마다 박자에 맞춰 톡톡 튀어 오르고
 *  · *강조* 단어는 색 + 밑줄 + 발광 + 심장박동처럼 한 번 더 맥동
 *  · 컷 시작에는 자막 전체가 "탁" 하고 박힘
 */
export function drawCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  options: {
    accent: string;
    fontSize: number;
    maxWidth: number;
    centerX: number;
    bottom: number;
    elapsed: number;
    /** 이 컷의 길이 — 단어 등장 박자를 여기에 맞춥니다. */
    duration?: number;
    /** 짧은 CTA 문장은 말풍선에 담습니다. */
    bubble?: boolean;
    opacity?: number;
    /** 자막 테마 — 임팩트·말풍선·네온·미니멀 */
    theme?: CaptionTheme;
  },
): number {
  const words = splitWords(text);
  if (words.length === 0) return 0;
  const { accent, fontSize, maxWidth, centerX, bottom, elapsed } = options;
  const duration = Math.max(0.6, options.duration ?? Math.max(2, words.length * 0.45));
  const opacity = options.opacity ?? 1;
  const theme: CaptionTheme = options.theme ?? 'impact';
  const useBubble = options.bubble === true || theme === 'bubble';
  const strokeWidth = theme === 'impact' ? Math.max(6, fontSize * 0.19) : theme === 'minimal' ? Math.max(3, fontSize * 0.08) : 0;
  const underline = theme === 'impact' || theme === 'neon';

  ctx.save();
  ctx.font = captionFont(fontSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const { lines } = wrapWords(ctx, words, maxWidth);
  const lineHeight = fontSize * 1.16;
  const totalHeight = lines.length * lineHeight;

  const space = ctx.measureText(' ').width;
  const lineWidths = lines.map((line) => {
    const widths = line.map((word) => ctx.measureText(word.text).width);
    return widths.reduce((sum, width) => sum + width, 0) + space * Math.max(0, line.length - 1);
  });
  const widest = Math.max(...lineWidths, 10);

  // 컷 시작의 "탁" — 아주 짧게 크게 떴다가 제자리로.
  const slam = 1 + 0.07 * Math.exp(-11 * Math.max(0, elapsed));
  const slamDrop = 26 * Math.exp(-13 * Math.max(0, elapsed));

  ctx.translate(centerX, bottom - totalHeight + slamDrop);
  ctx.scale(slam, slam);
  ctx.translate(-centerX, -(bottom - totalHeight));

  // 말풍선(짧은 문장·말풍선 테마) — 자막 뒤에 둥근 판과 꼬리를 그립니다.
  if (useBubble) {
    const padX = 52;
    const padY = 36;
    const bubbleW = Math.min(maxWidth + padX * 2, widest + padX * 2);
    const bubbleH = totalHeight + padY * 2;
    const bubbleTop = bottom - totalHeight - padY;
    const pop = backOut(clamp01(elapsed / 0.36));
    ctx.save();
    ctx.globalAlpha = opacity * clamp01(elapsed / 0.16);
    ctx.translate(centerX, bubbleTop + bubbleH / 2);
    ctx.rotate(-0.012);
    ctx.scale(0.78 + 0.22 * pop, 0.78 + 0.22 * pop);
    ctx.translate(-centerX, -(bubbleTop + bubbleH / 2));
    const radius = Math.min(54, bubbleH / 2);
    // 그림자 + 몸통
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = 'rgba(10, 9, 16, 0.68)';
    ctx.beginPath();
    ctx.roundRect(centerX - bubbleW / 2, bubbleTop, bubbleW, bubbleH, radius);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    // 꼬리 — 몸통과 같은 색으로 이어 붙입니다.
    ctx.beginPath();
    ctx.moveTo(centerX - 30, bubbleTop + bubbleH - 14);
    ctx.quadraticCurveTo(centerX - 8, bubbleTop + bubbleH + 22, centerX + 16, bubbleTop + bubbleH + 34);
    ctx.quadraticCurveTo(centerX + 12, bubbleTop + bubbleH + 10, centerX + 34, bubbleTop + bubbleH - 16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(accent, 0.42);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(centerX - bubbleW / 2, bubbleTop, bubbleW, bubbleH, radius);
    ctx.stroke();
    ctx.restore();
  }

  const revealSpan = Math.min(duration * 0.62, Math.max(0.45, duration * 0.5));
  const step = words.length > 1 ? revealSpan / words.length : 0;

  let wordIndex = 0;
  lines.forEach((line, lineIndex) => {
    const widths = line.map((word) => ctx.measureText(word.text).width);
    let cursor = centerX - (lineWidths[lineIndex] ?? 0) / 2;
    const y = bottom - totalHeight + lineIndex * lineHeight + lineHeight / 2;
    line.forEach((word, index) => {
      const width = widths[index] ?? 0;
      const delay = 0.05 + wordIndex * step;
      const u = clamp01((elapsed - delay) / 0.3);
      const pop = u <= 0 ? 0 : theme === 'minimal' ? 0.94 + 0.06 * backOut(u) : 0.72 + 0.28 * backOut(u);
      const land = delay + 0.3;
      const after = Math.max(0, elapsed - land);
      const pulse = word.highlighted ? 1 + 0.05 * Math.sin(after * 13) * Math.exp(-after * 3.4) : 1;
      const jitter = word.highlighted && theme !== 'minimal' ? Math.sin(after * 38) * 2.4 * Math.exp(-after * 9) : 0;

      ctx.save();
      ctx.globalAlpha = opacity * clamp01(u * 2.4);
      ctx.translate(cursor + width / 2 + jitter, y + (1 - u) * 46);
      ctx.scale(pop * pulse, pop * pulse);
      ctx.font = captionFont(fontSize);
      ctx.textAlign = 'center';
      if (strokeWidth > 0) {
        ctx.lineWidth = strokeWidth;
        ctx.strokeStyle = 'rgba(6, 6, 10, 0.92)';
        ctx.strokeText(word.text, 0, 0);
      }
      if (theme === 'neon') {
        ctx.shadowColor = rgba(accent, word.highlighted ? 0.9 : 0.55);
        ctx.shadowBlur = word.highlighted ? 40 : 22;
      } else if (word.highlighted && theme !== 'minimal') {
        ctx.shadowColor = rgba(accent, 0.75);
        ctx.shadowBlur = 24 + 14 * Math.sin(after * 9);
      } else if (theme === 'minimal') {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 3;
      }
      ctx.fillStyle = word.highlighted ? accent : '#ffffff';
      ctx.fillText(word.text, 0, 0);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.restore();

      // 강조 단어 밑줄 — 박힌 뒤 왼쪽에서 오른쪽으로 그립니다.
      if (underline && word.highlighted && after > 0) {
        const grow = clamp01(after / 0.22);
        const barW = width * 0.92 * (0.2 + 0.8 * grow);
        const barY = y + fontSize * 0.56;
        ctx.save();
        ctx.globalAlpha = opacity * grow * (theme === 'neon' ? 0.7 : 0.9);
        ctx.fillStyle = accent;
        if (theme === 'neon') {
          ctx.shadowColor = rgba(accent, 0.9);
          ctx.shadowBlur = 18;
        }
        ctx.beginPath();
        ctx.roundRect(cursor + width / 2 - barW / 2, barY, barW, Math.max(5, fontSize * 0.08), 6);
        ctx.fill();
        ctx.restore();
      }
      cursor += width + space;
      wordIndex += 1;
    });
  });
  ctx.restore();
  return totalHeight;
}

/**
 * 상단 후킹 배너·진행 게이지·컷 번호 — 캔버스에 구워 영상에도 그대로 남습니다.
 * 배너는 살아 있는 듯 미세하게 맥동하고, 게이지 머리에는 빛이 붙습니다.
 */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  options: {
    banner: string;
    index: number;
    count: number;
    progress: number;
    accent: string;
    fontScale: number;
    /** 컷이 시작된 뒤 흐른 시간 — 배너 맥동에 씁니다. */
    elapsed?: number;
  },
): void {
  const { banner, index, count, progress, accent, fontScale } = options;
  const elapsed = options.elapsed ?? 0;
  const pad = 26 * fontScale;
  const barTop = pad;
  const barWidth = 1080 - pad * 2;
  const gap = 8;
  const cell = (barWidth - gap * (count - 1)) / count;
  const barH = 8 * fontScale;

  for (let cellIndex = 0; cellIndex < count; cellIndex += 1) {
    const x = pad + cellIndex * (cell + gap);
    ctx.fillStyle = rgba('#ffffff', 0.26);
    ctx.beginPath();
    ctx.roundRect(x, barTop, cell, barH, barH / 2);
    ctx.fill();
    if (cellIndex <= index) {
      const filled = cellIndex < index ? 1 : clamp01(progress);
      const width = Math.max(barH, cell * filled);
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(x, barTop, width, barH, barH / 2);
      ctx.fill();
      if (cellIndex === index) {
        // 게이지 머리의 빛
        ctx.save();
        ctx.shadowColor = accent;
        ctx.shadowBlur = 18;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x + width - barH / 2, barTop + barH / 2, barH * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // 배너 — 살아 있는 듯 아주 느린 맥동 + 지나가는 빛
  ctx.save();
  const pulse = 1 + 0.02 * Math.sin(elapsed * 5.2);
  const text = banner || '';
  ctx.font = `800 ${30 * fontScale}px Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  const chipW = Math.min(760, ctx.measureText(text).width + 38);
  const chipH = 48 * fontScale;
  const chipX = pad;
  const chipY = barTop + 26 * fontScale;
  ctx.translate(chipX, chipY + chipH / 2);
  ctx.scale(pulse, pulse);
  ctx.translate(-chipX, -(chipY + chipH / 2));
  ctx.fillStyle = rgba('#000000', 0.46);
  ctx.beginPath();
  ctx.roundRect(chipX, chipY, chipW, chipH, chipH / 2);
  ctx.fill();
  ctx.strokeStyle = rgba(accent, 0.35 + 0.2 * Math.sin(elapsed * 5.2));
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(chipX, chipY, chipW, chipH, chipH / 2);
  ctx.clip();
  const sweepX = chipX - 160 + ((elapsed * 260) % (chipW + 320));
  const sheen = ctx.createLinearGradient(sweepX, 0, sweepX + 160, 0);
  sheen.addColorStop(0, rgba('#ffffff', 0));
  sheen.addColorStop(0.5, rgba('#ffffff', 0.16));
  sheen.addColorStop(1, rgba('#ffffff', 0));
  ctx.fillStyle = sheen;
  ctx.fillRect(chipX, chipY, chipW, chipH);
  ctx.restore();
  ctx.fillStyle = rgba('#ffffff', 0.94);
  ctx.textAlign = 'left';
  ctx.fillText(text, chipX + 19, chipY + chipH / 2 + 1);
  ctx.restore();

  // 컷 번호
  ctx.save();
  ctx.font = `800 ${28 * fontScale}px Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  const badgeW = 120;
  const badgeH = 48 * fontScale;
  const badgeX = 1080 - pad - badgeW;
  ctx.fillStyle = rgba('#000000', 0.46);
  ctx.beginPath();
  ctx.roundRect(badgeX, chipY, badgeW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.fillStyle = rgba('#ffffff', 0.82);
  ctx.fillText(`${index + 1}/${count}`, badgeX + badgeW - 19, chipY + badgeH / 2 + 1);
  ctx.restore();
}

/**
 * 브랜드 워터마크 — 채널 핸들(@)과 로고를 화면 구석에 작게 얹습니다.
 * 자막과 마찬가지로 캔버스에 구워지므로 저장한 영상에도 그대로 남습니다.
 * 안전 영역(위 116px / 아래 232px) 안쪽에만 놓여 플랫폼 UI에 가리지 않습니다.
 */
export function drawBrand(
  ctx: CanvasRenderingContext2D,
  options: {
    handle: string;
    accent: string;
    corner: BrandCorner;
    logo?: HTMLImageElement | null;
    opacity?: number;
  },
): void {
  const handle = options.handle.trim().replace(/^@+/, '').slice(0, 24);
  if (!handle) return;
  const text = `@${handle}`;
  const opacity = options.opacity ?? 0.94;
  const logo = options.logo ?? null;
  const font = (size: number) =>
    `800 ${size}px Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif`;

  ctx.save();
  ctx.globalAlpha = opacity;
  let fontSize = 34;
  ctx.font = font(fontSize);
  while (fontSize > 20 && ctx.measureText(text).width > 320) {
    fontSize -= 2;
    ctx.font = font(fontSize);
  }
  const textW = ctx.measureText(text).width;
  const logoSize = logo ? 44 : 0;
  const gap = logo ? 12 : 0;
  const padX = 20;
  const chipH = 62;
  const chipW = padX * 2 + logoSize + gap + textW;
  const pad = 36;
  const left = options.corner === 'top-left' || options.corner === 'bottom-left';
  const top = options.corner === 'top-left' || options.corner === 'top-right';
  const x = left ? pad : 1080 - pad - chipW;
  const y = top ? 116 : 1920 - 232;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = 'rgba(8, 7, 12, 0.5)';
  ctx.beginPath();
  ctx.roundRect(x, y, chipW, chipH, chipH / 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = rgba(options.accent, 0.34);
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.roundRect(x, y, chipW, chipH, chipH / 2);
  ctx.stroke();

  let cursorX = x + padX;
  if (logo) {
    const radius = logoSize / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cursorX + radius, y + chipH / 2, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, cursorX, y + (chipH - logoSize) / 2, logoSize, logoSize);
    ctx.restore();
    cursorX += logoSize + gap;
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cursorX, y + chipH / 2 + 1);
  ctx.restore();
}

/**
 * 플랫폼 워터마크 — Free 요금제 영상 하단에 작게 남는 '숏컷 스튜디오' 표식.
 * Pro·Team은 이 표식 없이 저장됩니다(브랜드 워터마크는 별개로 사용자가 켜고 끕니다).
 */
export function drawPlatformMark(ctx: CanvasRenderingContext2D, options: { opacity?: number } = {}): void {
  const text = '숏컷 스튜디오';
  const opacity = options.opacity ?? 0.8;
  ctx.save();
  ctx.globalAlpha = opacity;
  const fontSize = 25;
  ctx.font = `700 ${fontSize}px Pretendard, "Pretendard Variable", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const textW = ctx.measureText(text).width;
  const chipW = textW + 44;
  const chipH = 46;
  const x = 540 - chipW / 2;
  const y = 1920 - 96;
  ctx.fillStyle = 'rgba(6, 8, 12, 0.42)';
  ctx.beginPath();
  ctx.roundRect(x, y, chipW, chipH, chipH / 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(x, y, chipW, chipH, chipH / 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.86)';
  ctx.fillText(text, 540, y + chipH / 2 + 1);
  ctx.restore();
}
