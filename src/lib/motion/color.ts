/** 캔버스 그림에 쓰는 색 도구 — 투명도·혼합·색조 회전. */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const value = Number.parseInt(full, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}

/** 두 색을 섞습니다. t=0 → a, t=1 → b */
export function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  const to = (x: number, y: number) => Math.round(x + (y - x) * k);
  return rgbHex(to(ca.r, cb.r), to(ca.g, cb.g), to(ca.b, cb.b));
}

export function rgbHex(r: number, g: number, b: number): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

export function shade(hex: string, amount: number): string {
  return amount >= 0 ? mix(hex, '#ffffff', amount) : mix(hex, '#000000', -amount);
}

function toHsl(hex: string): [number, number, number] {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const light = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return [0, 0, light];
  const sat = delta / (1 - Math.abs(2 * light - 1));
  let hue = 0;
  if (max === rn) hue = ((gn - bn) / delta) % 6;
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;
  return [(hue * 60 + 360) % 360, sat, light];
}

function fromHsl(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(1, s));
  const light = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  const [r, g, b] =
    hue < 60
      ? [c, x, 0]
      : hue < 120
        ? [x, c, 0]
        : hue < 180
          ? [0, c, x]
          : hue < 240
            ? [0, x, c]
            : hue < 300
              ? [x, 0, c]
              : [c, 0, x];
  return rgbHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** 색조 회전 — 같은 팔레트도 생성마다 다르게 보이게 합니다. */
export function rotateHue(hex: string, degrees: number, satBoost = 0, lightShift = 0): string {
  const [h, s, l] = toHsl(hex);
  return fromHsl(h + degrees, s + satBoost, l + lightShift);
}

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function readableOn(hex: string): string {
  return luminance(hex) > 0.62 ? '#101014' : '#ffffff';
}
