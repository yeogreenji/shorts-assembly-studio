import { rgba } from './color';

export interface CaptionWord {
  text: string;
  highlighted: boolean;
}

/** *별표* 표시를 단어 단위로 나눠 강조 여부를 유지합니다. */
export function splitWords(input: string): CaptionWord[] {
  const words: CaptionWord[] = [];
  const regex = /\*([^*]+)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const pushPlain = (text: string) => {
    for (const piece of text.split(/\s+/)) {
      if (piece) words.push({ text: piece, highlighted: false });
    }
  };
  while ((match = regex.exec(input)) !== null) {
    pushPlain(input.slice(last, match.index));
    for (const piece of (match[1] ?? '').split(/\s+/)) {
      if (piece) words.push({ text: piece, highlighted: true });
    }
    last = match.index + match[0].length;
  }
  pushPlain(input.slice(last));
  return words;
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

/**
 * 숏츠 자막을 캔버스에 굽습니다(내보낸 영상에도 그대로 남습니다).
 * 단어마다 살짝 늦게 튀어 오르는 애니메이션.
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
    opacity?: number;
  },
): number {
  const words = splitWords(text);
  if (words.length === 0) return 0;
  const { accent, fontSize, maxWidth, centerX, bottom, elapsed } = options;
  ctx.save();
  ctx.font = captionFont(fontSize);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const { lines } = wrapWords(ctx, words, maxWidth);
  const lineHeight = fontSize * 1.16;
  const totalHeight = lines.length * lineHeight;
  const top = bottom - totalHeight;

  let wordIndex = 0;
  lines.forEach((line, lineIndex) => {
    const widths = line.map((word) => ctx.measureText(word.text).width);
    const space = ctx.measureText(' ').width;
    const lineWidth = widths.reduce((sum, width) => sum + width, 0) + space * (line.length - 1);
    let cursor = centerX - lineWidth / 2;
    const y = top + lineIndex * lineHeight + lineHeight / 2;
    line.forEach((word, index) => {
      const width = widths[index] ?? 0;
      const delay = wordIndex * 0.045;
      const local = Math.max(0, Math.min(1, (elapsed - delay) / 0.3));
      const eased = 1 - (1 - local) ** 3;
      const scale = 0.86 + 0.14 * eased;
      const offsetY = (1 - eased) * 26;
      ctx.save();
      ctx.globalAlpha = (options.opacity ?? 1) * eased;
      ctx.translate(cursor + width / 2, y + offsetY);
      ctx.scale(scale, scale);
      ctx.font = captionFont(fontSize);
      ctx.textAlign = 'center';
      ctx.lineWidth = Math.max(6, fontSize * 0.19);
      ctx.strokeStyle = 'rgba(6, 6, 10, 0.92)';
      ctx.strokeText(word.text, 0, 0);
      ctx.fillStyle = word.highlighted ? accent : '#ffffff';
      ctx.fillText(word.text, 0, 0);
      ctx.restore();
      cursor += width + space;
      wordIndex += 1;
    });
  });
  ctx.restore();
  return totalHeight;
}

/** 상단 라벨·컷 표시를 캔버스에 굽습니다. */
export function drawHud(
  ctx: CanvasRenderingContext2D,
  options: {
    banner: string;
    index: number;
    count: number;
    progress: number;
    accent: string;
    fontScale: number;
  },
): void {
  const { banner, index, count, progress, accent, fontScale } = options;
  const pad = 26 * fontScale;
  const barTop = pad;
  const barWidth = 1080 - pad * 2;
  const gap = 8;
  const cell = (barWidth - gap * (count - 1)) / count;
  for (let cellIndex = 0; cellIndex < count; cellIndex += 1) {
    const x = pad + cellIndex * (cell + gap);
    ctx.fillStyle = rgba('#ffffff', 0.28);
    ctx.beginPath();
    ctx.roundRect(x, barTop, cell, 8 * fontScale, 4);
    ctx.fill();
    if (cellIndex < index || cellIndex === index) {
      const width = cellIndex < index ? cell : cell * Math.min(1, Math.max(0, progress));
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(x, barTop, Math.max(4, width), 8 * fontScale, 4);
      ctx.fill();
    }
  }
  // 라벨
  ctx.save();
  ctx.font = `800 ${30 * fontScale}px Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  const text = banner || '';
  const width = Math.min(760, ctx.measureText(text).width + 34);
  ctx.fillStyle = rgba('#000000', 0.45);
  ctx.beginPath();
  ctx.roundRect(pad, barTop + 26 * fontScale, width, 48 * fontScale, 24 * fontScale);
  ctx.fill();
  ctx.fillStyle = rgba('#ffffff', 0.92);
  ctx.textAlign = 'left';
  ctx.fillText(text, pad + 17, barTop + 50 * fontScale);
  // 컷 번호
  ctx.textAlign = 'right';
  ctx.fillStyle = rgba('#000000', 0.45);
  ctx.beginPath();
  ctx.roundRect(1080 - pad - 120, barTop + 26 * fontScale, 120, 48 * fontScale, 24 * fontScale);
  ctx.fill();
  ctx.fillStyle = rgba('#ffffff', 0.8);
  ctx.fillText(`${index + 1}/${count}`, 1080 - pad - 18, barTop + 50 * fontScale);
  ctx.restore();
}
