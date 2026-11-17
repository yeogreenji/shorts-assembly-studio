import type { Shorts, TemplateId } from '../types';

/**
 * 컷마다 새로 그려지는 장면 일러스트(SVG).
 * 같은 템플릿이어도 쇼츠를 만들 때마다 seed가 달라지고, 컷 자막의 단어(월급·시계·카톡…)에 따라 소품이 바뀝니다.
 * 컷 하나는 [하늘/방 배경] + [도시 실루엣] + [중심 소품] + [떠다니는 입자] 네 층으로 이루어집니다.
 */

export type Motif =
  | 'desk'
  | 'money'
  | 'clock'
  | 'home'
  | 'phone'
  | 'heart'
  | 'cart'
  | 'tech'
  | 'idea'
  | 'check'
  | 'vote';

interface Mood {
  top: string;
  mid: string;
  bot: string;
  sun: string;
  far: string;
  near: string;
  win: string;
  accent: string;
  dark: boolean;
}

const MOODS: Record<string, Mood> = {
  sunset: { top: '#3b1d6e', mid: '#e0527a', bot: '#ffb36b', sun: '#fff1b8', far: '#7a3a8a', near: '#2a1348', win: '#ffd27a', accent: '#ffe27a', dark: false },
  night: { top: '#050a22', mid: '#13236b', bot: '#3b5bdb', sun: '#e8eeff', far: '#1d2f7a', near: '#0a1038', win: '#ffe08a', accent: '#8be9ff', dark: true },
  day: { top: '#3b97f5', mid: '#8ccbff', bot: '#e8f7ff', sun: '#fff8c4', far: '#86a9d9', near: '#4f73a8', win: '#ffffff', accent: '#ffcf4a', dark: false },
  mint: { top: '#0b5f5a', mid: '#3fd0bd', bot: '#fdf1c4', sun: '#fffbe3', far: '#2b8f88', near: '#0f4f4b', win: '#fff3b0', accent: '#fff08a', dark: false },
  neon: { top: '#13002e', mid: '#5b1a9a', bot: '#ff3d8b', sun: '#ffd6ee', far: '#40107a', near: '#1b0538', win: '#7ef9ff', accent: '#7ef9ff', dark: true },
  coral: { top: '#4a1d8f', mid: '#fb6f8e', bot: '#ffd9b0', sun: '#fff4d6', far: '#8c3a9c', near: '#33105f', win: '#ffe9a8', accent: '#ffe49a', dark: false },
  dawn: { top: '#1c2a6b', mid: '#7c6bd6', bot: '#ffc9a8', sun: '#fff0d0', far: '#4a4a9c', near: '#1a1f55', win: '#ffe6a0', accent: '#ffd9a0', dark: true },
};

const POOLS: Record<TemplateId, string[]> = {
  balance: ['sunset', 'night', 'neon', 'dawn', 'day'],
  living: ['mint', 'day', 'sunset', 'dawn', 'coral'],
  love: ['coral', 'sunset', 'neon', 'dawn', 'night'],
  it: ['night', 'neon', 'day', 'dawn', 'mint'],
};

const KEYWORDS: [Motif, RegExp][] = [
  ['vote', /댓글|투표|골라|선택|어느 쪽|1번|2번|저장|팔로우/],
  ['phone', /카톡|문자|톡|답장|연락|메시지|소개팅|DM|전화|알림/],
  ['heart', /연애|썸|좋아|사랑|데이트|설렘|고백|마음|커플|첫인상/],
  ['money', /월급|돈|연봉|월세|절약|아끼|비용|값|요금|통장|적금|가격|\d+\s?%|배\b/],
  ['clock', /칼퇴|시간|점심|아침|시계|분|퇴근|출근|밤|새벽|늦|빨리|하루/],
  ['desk', /야근|회의|팀장|업무|회사|보고|상사|직장|메일|단톡/],
  ['home', /집|방|자취|전기|에어컨|제습|수납|냉장고|청소|세탁|이사|인테리어|창문/],
  ['cart', /사|구매|장보기|쇼핑|선반|마트|배송|주문|후회/],
  ['tech', /AI|앱|IT|서버|보안|코드|출시|기능|업데이트|개발|데이터|클라우드/],
  ['check', /체크|리스트|순서|확인|준비|단계|정리/],
  ['idea', /팁|꿀|아이디어|방법|비법|노하우|핵심|이유/],
];

const FALLBACK: Record<TemplateId, Motif[]> = {
  balance: ['desk', 'money', 'clock', 'home', 'check', 'vote'],
  living: ['home', 'idea', 'check', 'cart', 'money', 'vote'],
  love: ['phone', 'heart', 'phone', 'idea', 'heart', 'vote'],
  it: ['tech', 'idea', 'tech', 'check', 'phone', 'vote'],
};

const ALT: Record<TemplateId, Motif[]> = {
  balance: ['desk', 'money', 'clock', 'home', 'phone', 'check', 'cart', 'idea'],
  living: ['home', 'idea', 'check', 'cart', 'money', 'clock', 'tech'],
  love: ['phone', 'heart', 'idea', 'clock', 'cart', 'home'],
  it: ['tech', 'idea', 'check', 'phone', 'money', 'clock', 'desk'],
};

/* ── 유틸 ─────────────────────────────────────── */

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: number) {
  let a = seed >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min: number, max: number) => min + next() * (max - min),
    int: (min: number, max: number) => Math.floor(min + next() * (max - min + 1)),
    pick: <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T,
    chance: (p: number) => next() < p,
  };
}
type Rng = ReturnType<typeof makeRng>;

const n = (value: number) => Math.round(value * 10) / 10;

function mix(hex: string, other: string, t: number): string {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const a = parse(hex);
  const b = parse(other);
  const out = a.map((v, i) => Math.round(v + ((b[i] ?? 0) - v) * t));
  return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
const lighten = (hex: string, t: number) => mix(hex, '#ffffff', t);
const darken = (hex: string, t: number) => mix(hex, '#000000', t);

/* ── 컷별 소품 고르기 ────────────────────────────── */

export function motifsFor(shorts: Pick<Shorts, 'cuts' | 'template' | 'seed' | 'topic'>): Motif[] {
  const rng = makeRng(hash(`${shorts.seed ?? 0}:${shorts.topic}:motif`));
  const result: Motif[] = [];
  const last = shorts.cuts.length - 1;
  shorts.cuts.forEach((cut, index) => {
    const variant = cut.variant ?? 0;
    const local = makeRng(hash(`${shorts.seed ?? 0}:${cut.id}:${variant}`));
    let choice: Motif | null = null;
    if (index === last) {
      choice = 'vote';
    } else if (variant === 0) {
      const found = KEYWORDS.find(([motif, pattern]) => motif !== 'vote' && pattern.test(cut.subtitle));
      choice = found ? found[0] : null;
    }
    if (!choice) {
      const base = FALLBACK[shorts.template];
      choice = variant === 0 && rng.chance(0.55) ? (base[index % base.length] as Motif) : local.pick(ALT[shorts.template]);
    }
    // 같은 소품이 연달아 나오면 다른 것으로 바꿉니다.
    const prev = result[index - 1];
    if (prev === choice && index !== last) {
      const options = ALT[shorts.template].filter((m) => m !== prev);
      choice = local.pick(options);
    }
    result.push(choice);
  });
  return result;
}

/* ── 배경 ─────────────────────────────────────── */

function skyBackdrop(rng: Rng, m: Mood, u: string): string {
  const sunX = rng.range(160, 920);
  const sunY = rng.range(360, 720);
  const sunR = rng.range(90, 150);
  let svg = `<rect width="1080" height="1920" fill="url(#${u}-sky)"/>`;
  if (m.dark) {
    for (let i = 0; i < 46; i += 1) {
      const x = rng.range(10, 1070);
      const y = rng.range(10, 980);
      const r = rng.range(1.2, 3.6);
      svg += `<circle class="sc-twinkle" style="animation-delay:${n(rng.range(0, 3))}s" cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="#fff" opacity="${n(rng.range(0.4, 0.95))}"/>`;
    }
  }
  svg += `<circle cx="${n(sunX)}" cy="${n(sunY)}" r="${n(sunR * 3.4)}" fill="url(#${u}-sunglow)"/>`;
  svg += `<circle cx="${n(sunX)}" cy="${n(sunY)}" r="${n(sunR)}" fill="${m.sun}"/>`;
  if (m.dark) svg += `<circle cx="${n(sunX + sunR * 0.3)}" cy="${n(sunY - sunR * 0.1)}" r="${n(sunR * 0.82)}" fill="${m.top}" opacity="0.18"/>`;
  const clouds = rng.int(3, 5);
  for (let i = 0; i < clouds; i += 1) {
    const cx = rng.range(-60, 1000);
    const cy = rng.range(180, 1000);
    const s = rng.range(0.7, 1.6);
    const tone = m.dark ? lighten(m.mid, 0.12) : lighten(m.bot, 0.55);
    svg += `<g class="sc-drift" style="animation-duration:${n(rng.range(16, 32))}s;animation-delay:-${n(rng.range(0, 14))}s" opacity="${n(rng.range(0.28, 0.6))}">`;
    svg += `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(150 * s)}" ry="${n(34 * s)}" fill="${tone}"/>`;
    svg += `<ellipse cx="${n(cx - 60 * s)}" cy="${n(cy - 24 * s)}" rx="${n(80 * s)}" ry="${n(36 * s)}" fill="${tone}"/>`;
    svg += `<ellipse cx="${n(cx + 40 * s)}" cy="${n(cy - 34 * s)}" rx="${n(96 * s)}" ry="${n(42 * s)}" fill="${tone}"/></g>`;
  }
  return svg;
}

function skyline(rng: Rng, m: Mood, baseY: number, layers = 3): string {
  let svg = '';
  for (let layer = 0; layer < layers; layer += 1) {
    const t = layer / Math.max(1, layers - 1);
    const fill = mix(m.far, m.near, 0.25 + t * 0.75);
    const maxH = 520 - layer * 110;
    let x = -40 - rng.range(0, 60);
    while (x < 1100) {
      const w = rng.range(70, 160) * (1 - layer * 0.1);
      const h = rng.range(maxH * 0.35, maxH);
      const y = baseY - h;
      svg += `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h + 600)}" fill="${fill}"/>`;
      if (rng.chance(0.25)) svg += `<rect x="${n(x + w * 0.42)}" y="${n(y - 60)}" width="8" height="64" fill="${fill}"/>`;
      if (layer >= 1) {
        const cols = Math.max(2, Math.floor(w / 30));
        const rows = Math.floor(h / 46);
        for (let c = 0; c < cols; c += 1) {
          for (let r = 0; r < rows; r += 1) {
            if (!rng.chance(layer === 2 ? 0.42 : 0.28)) continue;
            const wx = x + 12 + c * ((w - 24) / cols);
            const wy = y + 18 + r * 46;
            const lit = m.win;
            svg += `<rect ${rng.chance(0.1) ? 'class="sc-twinkle"' : ''} x="${n(wx)}" y="${n(wy)}" width="${n(Math.max(8, (w - 24) / cols - 8))}" height="20" rx="2" fill="${lit}" opacity="${n(rng.range(0.45, 0.95))}"/>`;
          }
        }
      }
      x += w + rng.range(-6, 14);
    }
  }
  return svg;
}

function ground(m: Mood, u: string): string {
  return (
    `<rect y="1120" width="1080" height="800" fill="url(#${u}-ground)"/>` +
    `<ellipse cx="540" cy="1130" rx="520" ry="46" fill="${m.accent}" opacity="0.1"/>`
  );
}

function roomBackdrop(rng: Rng, m: Mood, u: string): string {
  const wall = darken(mix(m.near, m.mid, 0.25), 0.1);
  const winX = rng.int(90, 230);
  const winW = rng.int(620, 760);
  let svg = `<rect width="1080" height="1920" fill="${wall}"/>`;
  svg += `<rect width="1080" height="1920" fill="url(#${u}-wall)"/>`;
  svg += `<clipPath id="${u}-win"><rect x="${winX}" y="170" width="${winW}" height="760" rx="14"/></clipPath>`;
  svg += `<g clip-path="url(#${u}-win)"><rect x="${winX}" y="170" width="${winW}" height="760" fill="url(#${u}-sky)"/>`;
  svg += `<circle cx="${n(winX + winW * rng.range(0.2, 0.8))}" cy="${n(rng.range(300, 520))}" r="${n(rng.range(60, 110))}" fill="${m.sun}" opacity="0.95"/>`;
  svg += skyline(rng, m, 930, 2);
  svg += `</g>`;
  const frame = darken(wall, 0.35);
  svg += `<rect x="${winX}" y="170" width="${winW}" height="760" rx="14" fill="none" stroke="${frame}" stroke-width="22"/>`;
  svg += `<rect x="${n(winX + winW / 2 - 8)}" y="170" width="16" height="760" fill="${frame}"/>`;
  svg += `<rect x="${winX}" y="${n(170 + 380 - 8)}" width="${winW}" height="16" fill="${frame}"/>`;
  svg += `<path d="M${winX + 20} 190 L${winX + winW - 20} 190 L${winX + winW + 220} 1180 L${winX - 220} 1180 Z" fill="${m.sun}" opacity="0.07"/>`;
  svg += `<rect y="1090" width="1080" height="830" fill="url(#${u}-floor)"/>`;
  svg += `<rect y="1080" width="1080" height="16" fill="${darken(wall, 0.45)}"/>`;
  return svg;
}

function abstractBackdrop(rng: Rng, m: Mood, u: string): string {
  let svg = `<rect width="1080" height="1920" fill="url(#${u}-sky)"/>`;
  for (let i = 0; i < 5; i += 1) {
    const r = rng.range(220, 460);
    const x = rng.range(0, 1080);
    const y = rng.range(100, 1200);
    const color = rng.pick([m.mid, m.bot, m.accent, m.far]);
    svg += `<circle class="sc-float-s" style="animation-delay:-${n(rng.range(0, 5))}s" cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${color}" opacity="${n(rng.range(0.14, 0.32))}"/>`;
  }
  const step = rng.int(90, 150);
  for (let i = -2; i < 14; i += 1) {
    svg += `<path d="M${i * step} 0 L${i * step + 900} 1200" stroke="${m.accent}" stroke-width="2" opacity="0.07"/>`;
  }
  svg += skyline(rng, m, 1120, 2);
  svg += ground(m, u);
  return svg;
}

/* ── 중심 소품 ────────────────────────────────── */

const FLOAT = (delay: number) => `class="sc-float" style="animation-delay:-${n(delay)}s"`;

function star(x: number, y: number, r: number, fill: string, cls = 'sc-twinkle'): string {
  const p = r * 0.28;
  return `<path class="${cls}" d="M${n(x)} ${n(y - r)} Q${n(x + p)} ${n(y - p)} ${n(x + r)} ${n(y)} Q${n(x + p)} ${n(y + p)} ${n(x)} ${n(y + r)} Q${n(x - p)} ${n(y + p)} ${n(x - r)} ${n(y)} Q${n(x - p)} ${n(y - p)} ${n(x)} ${n(y - r)}Z" fill="${fill}"/>`;
}

function shadow(cx: number, cy: number, rx: number): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${n(rx * 0.1)}" fill="#000" opacity="0.32"/>`;
}

function heroDesk(rng: Rng, m: Mood, u: string): string {
  const screenA = lighten(m.accent, 0.1);
  let svg = shadow(540, 1060, 470);
  svg += `<rect x="40" y="1006" width="1000" height="44" rx="16" fill="url(#${u}-wood)"/>`;
  svg += `<rect x="70" y="1050" width="940" height="300" fill="${darken(m.near, 0.35)}"/>`;
  // 모니터
  svg += `<ellipse cx="540" cy="1000" rx="150" ry="16" fill="#101426"/>`;
  svg += `<rect x="500" y="900" width="80" height="104" fill="#1b2038"/>`;
  svg += `<rect x="236" y="470" width="608" height="440" rx="30" fill="#0b1022"/>`;
  svg += `<rect x="258" y="492" width="564" height="396" rx="16" fill="url(#${u}-screen)"/>`;
  const kind = rng.int(0, 2);
  if (kind === 0) {
    let points = '';
    let y = rng.range(780, 840);
    for (let i = 0; i < 9; i += 1) {
      y = Math.min(840, Math.max(540, y + rng.range(-70, 40)));
      points += `${n(290 + i * 62)},${n(y)} `;
    }
    svg += `<polyline points="${points}" fill="none" stroke="${screenA}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
    svg += `<polyline points="${points} 786,860 290,860" fill="${screenA}" opacity="0.16"/>`;
  } else if (kind === 1) {
    for (let i = 0; i < 7; i += 1) {
      const h = rng.range(60, 280);
      svg += `<rect x="${290 + i * 70}" y="${n(860 - h)}" width="44" height="${n(h)}" rx="8" fill="${i === 5 ? m.accent : screenA}" opacity="${i === 5 ? 1 : 0.55}"/>`;
    }
  } else {
    for (let r = 0; r < 4; r += 1) {
      svg += `<rect x="290" y="${520 + r * 82}" width="${rng.int(180, 470)}" height="22" rx="11" fill="${screenA}" opacity="${n(rng.range(0.35, 0.8))}"/>`;
      svg += `<circle cx="${790}" cy="${531 + r * 82}" r="13" fill="${r === 1 ? '#ff6b6b' : screenA}" opacity="0.9"/>`;
    }
  }
  svg += `<path d="M258 492 L520 492 L400 888 L258 888Z" fill="#fff" opacity="0.05"/>`;
  // 키보드 / 컵 / 서류
  svg += `<rect x="300" y="976" width="480" height="30" rx="10" fill="#1f2542"/>`;
  for (let i = 0; i < 16; i += 1) svg += `<rect x="${316 + i * 29}" y="984" width="22" height="9" rx="3" fill="#3a4272"/>`;
  svg += `<g ${FLOAT(rng.range(0, 4))}><rect x="104" y="900" width="104" height="104" rx="16" fill="#f4f1ea"/><rect x="104" y="900" width="104" height="30" rx="14" fill="${m.accent}"/><path d="M208 926 q46 8 40 44 q-6 30 -40 30" fill="none" stroke="#f4f1ea" stroke-width="16"/></g>`;
  for (let i = 0; i < 3; i += 1) {
    svg += `<path class="sc-steam" style="animation-delay:${i * 0.6}s" d="M${130 + i * 28} 880 q-18 -34 0 -62 q18 -26 0 -56" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" opacity="0.5"/>`;
  }
  for (let i = 0; i < 5; i += 1) {
    svg += `<rect x="${n(840 + rng.range(-6, 10))}" y="${970 - i * 18}" width="160" height="16" rx="3" fill="${i % 2 ? '#e9ecf8' : '#cfd5ee'}" transform="rotate(${n(rng.range(-4, 4))} 920 ${975 - i * 18})"/>`;
  }
  svg += `<rect x="850" y="820" width="140" height="14" rx="7" fill="${m.accent}" transform="rotate(-8 920 827)"/>`;
  return svg;
}

function coinStack(x: number, y: number, count: number, w: number, m: Mood, u: string): string {
  let svg = '';
  for (let i = 0; i < count; i += 1) {
    const cy = y - i * 24;
    svg += `<rect x="${x - w}" y="${cy}" width="${w * 2}" height="24" fill="url(#${u}-coin)"/>`;
    svg += `<ellipse cx="${x}" cy="${cy + 24}" rx="${w}" ry="${n(w * 0.25)}" fill="${darken('#f2b134', 0.22)}"/>`;
  }
  const top = y - (count - 1) * 24;
  svg += `<ellipse cx="${x}" cy="${top}" rx="${w}" ry="${n(w * 0.25)}" fill="#ffe08a"/>`;
  svg += `<ellipse cx="${x}" cy="${top}" rx="${n(w * 0.72)}" ry="${n(w * 0.17)}" fill="none" stroke="#f2b134" stroke-width="4"/>`;
  void m;
  return svg;
}

function heroMoney(rng: Rng, m: Mood, u: string): string {
  let svg = shadow(540, 1030, 400);
  svg += coinStack(240, 1010, rng.int(5, 9), 120, m, u);
  svg += coinStack(850, 1010, rng.int(3, 6), 110, m, u);
  // 지폐
  for (let i = 0; i < 3; i += 1) {
    const rot = -14 + i * 14;
    svg += `<g transform="rotate(${rot} 540 960)"><rect x="330" y="${900 - i * 6}" width="420" height="190" rx="16" fill="${i === 1 ? '#7fe0a4' : '#5fc88c'}"/><rect x="346" y="${916 - i * 6}" width="388" height="158" rx="10" fill="none" stroke="#2f8f60" stroke-width="4" opacity="0.7"/><circle cx="540" cy="${995 - i * 6}" r="48" fill="#2f8f60" opacity="0.55"/></g>`;
  }
  // 큰 동전
  svg += `<g class="sc-float-s"><circle cx="540" cy="640" r="250" fill="url(#${u}-coin)"/><circle cx="540" cy="640" r="250" fill="none" stroke="#fff3b8" stroke-width="10" opacity="0.7"/><circle cx="540" cy="640" r="196" fill="none" stroke="#c98a14" stroke-width="12" opacity="0.8"/>`;
  svg += `<text x="540" y="722" text-anchor="middle" font-size="230" font-weight="900" fill="#b97a0c" opacity="0.9" font-family="Pretendard, sans-serif">₩</text>`;
  svg += `<path d="M360 520 A220 220 0 0 1 560 430" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round" opacity="0.5"/></g>`;
  for (let i = 0; i < 6; i += 1) {
    const x = rng.range(110, 970);
    const y = rng.range(300, 860);
    const r = rng.range(26, 52);
    svg += `<g ${FLOAT(rng.range(0, 6))}><circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="url(#${u}-coin)"/><circle cx="${n(x)}" cy="${n(y)}" r="${n(r * 0.7)}" fill="none" stroke="#c98a14" stroke-width="4" opacity="0.7"/></g>`;
  }
  return svg;
}

function heroClock(rng: Rng, m: Mood, u: string): string {
  const cx = 540;
  const cy = 700;
  const r = 270;
  const hour = rng.range(0, 12);
  const minute = rng.range(0, 60);
  const ha = (hour / 12) * Math.PI * 2 - Math.PI / 2;
  const ma = (minute / 60) * Math.PI * 2 - Math.PI / 2;
  let svg = shadow(540, 1060, 300);
  svg += `<path d="M${cx - 190} ${cy + 220} L${cx - 250} 1040 L${cx - 190} 1040 L${cx - 130} ${cy + 260}Z M${cx + 190} ${cy + 220} L${cx + 250} 1040 L${cx + 190} 1040 L${cx + 130} ${cy + 260}Z" fill="${darken(m.accent, 0.35)}"/>`;
  svg += `<g class="sc-wiggle"><circle cx="${cx - 190}" cy="${cy - 220}" r="96" fill="${m.accent}"/><circle cx="${cx + 190}" cy="${cy - 220}" r="96" fill="${m.accent}"/><circle cx="${cx - 190}" cy="${cy - 220}" r="62" fill="${lighten(m.accent, 0.45)}" opacity="0.5"/><circle cx="${cx + 190}" cy="${cy - 220}" r="62" fill="${lighten(m.accent, 0.45)}" opacity="0.5"/></g>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${r + 28}" fill="${darken(m.accent, 0.15)}"/>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fbf7ee"/>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${u}-clockshade)"/>`;
  for (let i = 0; i < 60; i += 1) {
    const a = (i / 60) * Math.PI * 2;
    const big = i % 5 === 0;
    const r1 = r - (big ? 46 : 26);
    svg += `<line x1="${n(cx + Math.cos(a) * r1)}" y1="${n(cy + Math.sin(a) * r1)}" x2="${n(cx + Math.cos(a) * (r - 14))}" y2="${n(cy + Math.sin(a) * (r - 14))}" stroke="#2a2f4a" stroke-width="${big ? 10 : 4}" stroke-linecap="round" opacity="${big ? 1 : 0.55}"/>`;
  }
  svg += `<line x1="${cx}" y1="${cy}" x2="${n(cx + Math.cos(ha) * 130)}" y2="${n(cy + Math.sin(ha) * 130)}" stroke="#2a2f4a" stroke-width="22" stroke-linecap="round"/>`;
  svg += `<line x1="${cx}" y1="${cy}" x2="${n(cx + Math.cos(ma) * 200)}" y2="${n(cy + Math.sin(ma) * 200)}" stroke="#2a2f4a" stroke-width="14" stroke-linecap="round"/>`;
  svg += `<g class="sc-spin" style="transform-origin:${cx}px ${cy}px"><line x1="${cx}" y1="${cy + 36}" x2="${cx}" y2="${cy - 210}" stroke="#ff5a5a" stroke-width="6" stroke-linecap="round"/></g>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="22" fill="#ff5a5a"/>`;
  for (let i = 0; i < 3; i += 1) {
    svg += `<circle class="sc-ping" style="animation-delay:${i * 0.7}s;transform-origin:${cx}px ${cy}px" cx="${cx}" cy="${cy}" r="${r + 50}" fill="none" stroke="${m.accent}" stroke-width="5" opacity="0.5"/>`;
  }
  return svg;
}

function heroHome(rng: Rng, m: Mood, u: string): string {
  const wall = rng.pick(['#ffd9b8', '#f9e4a8', '#cfe9ff', '#ffd0dc']);
  let svg = shadow(540, 1060, 460);
  svg += `<rect x="130" y="1000" width="820" height="40" rx="12" fill="${darken(m.near, 0.1)}"/>`;
  svg += `<rect x="760" y="440" width="70" height="170" fill="${darken(wall, 0.25)}"/>`;
  svg += `<rect x="260" y="640" width="560" height="400" fill="${wall}"/>`;
  svg += `<rect x="260" y="640" width="560" height="400" fill="url(#${u}-wallshade)"/>`;
  svg += `<path d="M200 650 L540 380 L880 650Z" fill="${rng.pick(['#e2536a', '#4f6ee0', '#2fb89a', '#f08a3c'])}"/>`;
  svg += `<path d="M200 650 L540 380 L540 650Z" fill="#000" opacity="0.12"/>`;
  svg += `<rect x="470" y="780" width="140" height="260" rx="10" fill="#8a5a3a"/><circle cx="585" cy="915" r="9" fill="#ffd27a"/>`;
  [[310, 700], [650, 700]].forEach(([x, y], i) => {
    svg += `<rect x="${x}" y="${y}" width="120" height="120" rx="10" fill="${m.win}"/><rect x="${x}" y="${y}" width="120" height="120" rx="10" fill="none" stroke="#7a5a3a" stroke-width="10"/><line x1="${(x ?? 0) + 60}" y1="${y}" x2="${(x ?? 0) + 60}" y2="${(y ?? 0) + 120}" stroke="#7a5a3a" stroke-width="6"/><line x1="${x}" y1="${(y ?? 0) + 60}" x2="${(x ?? 0) + 120}" y2="${(y ?? 0) + 60}" stroke="#7a5a3a" stroke-width="6"/>`;
    svg += `<rect class="sc-twinkle" style="animation-delay:${i}s" x="${x}" y="${y}" width="120" height="120" rx="10" fill="${m.win}" opacity="0.35"/>`;
  });
  svg += `<circle cx="540" cy="540" r="38" fill="${m.win}"/><circle cx="540" cy="540" r="38" fill="none" stroke="#7a5a3a" stroke-width="10"/>`;
  svg += `<path d="M215 640 Q540 760 865 640" fill="none" stroke="#2a1d14" stroke-width="5" opacity="0.7"/>`;
  for (let i = 0; i < 9; i += 1) {
    const t = i / 8;
    const x = 215 + t * 650;
    const y = 640 + Math.sin(t * Math.PI) * 74;
    svg += `<circle class="sc-twinkle" style="animation-delay:${n(i * 0.3)}s" cx="${n(x)}" cy="${n(y + 6)}" r="12" fill="${m.accent}"/>`;
  }
  svg += `<g class="sc-wiggle"><path d="M150 1000 q-30 -80 20 -130 q40 60 10 130Z" fill="#3fbf7a"/><path d="M190 1000 q40 -90 90 -80 q-10 70 -90 80Z" fill="#2c9a62"/><rect x="140" y="990" width="70" height="54" rx="10" fill="#c76b4a"/></g>`;
  return svg;
}

function heroPhone(rng: Rng, m: Mood, u: string): string {
  let svg = shadow(540, 1100, 280);
  svg += `<g class="sc-float-s"><rect x="330" y="360" width="420" height="780" rx="68" fill="#0a0d1f"/><rect x="346" y="376" width="388" height="748" rx="54" fill="url(#${u}-screen)"/>`;
  svg += `<rect x="470" y="392" width="140" height="30" rx="15" fill="#0a0d1f"/>`;
  svg += `<rect x="372" y="446" width="336" height="64" rx="20" fill="#fff" opacity="0.14"/><circle cx="410" cy="478" r="22" fill="${m.accent}"/><rect x="446" y="466" width="150" height="14" rx="7" fill="#fff" opacity="0.7"/><rect x="446" y="488" width="96" height="10" rx="5" fill="#fff" opacity="0.4"/>`;
  let y = 548;
  const rows = rng.int(4, 5);
  for (let i = 0; i < rows; i += 1) {
    const mine = i % 2 === 1;
    const w = rng.int(170, 270);
    const h = rng.chance(0.5) ? 76 : 112;
    const x = mine ? 708 - w : 372;
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="26" fill="${mine ? m.accent : '#ffffff'}" opacity="${mine ? 0.95 : 0.9}"/>`;
    svg += `<rect x="${x + 24}" y="${y + 24}" width="${w - 48}" height="12" rx="6" fill="#1c2144" opacity="0.65"/>`;
    if (h > 90) svg += `<rect x="${x + 24}" y="${y + 52}" width="${n((w - 48) * 0.6)}" height="12" rx="6" fill="#1c2144" opacity="0.4"/>`;
    y += h + 18;
  }
  svg += `<g><circle class="sc-dot" cx="410" cy="${y + 20}" r="9" fill="#fff"/><circle class="sc-dot" style="animation-delay:.2s" cx="440" cy="${y + 20}" r="9" fill="#fff"/><circle class="sc-dot" style="animation-delay:.4s" cx="470" cy="${y + 20}" r="9" fill="#fff"/></g></g>`;
  svg += `<g ${FLOAT(1)}><circle cx="760" cy="420" r="44" fill="#ff4d6d"/><text x="760" y="438" text-anchor="middle" font-size="52" font-weight="900" fill="#fff" font-family="Pretendard, sans-serif">${rng.int(1, 9)}</text></g>`;
  for (let i = 0; i < 4; i += 1) svg += star(rng.range(120, 960), rng.range(300, 900), rng.range(16, 34), m.accent);
  return svg;
}

function heartPath(cx: number, cy: number, s: number): string {
  return `M${cx} ${cy + 220 * s} C${cx - 300 * s} ${cy - 20 * s} ${cx - 300 * s} ${cy - 300 * s} ${cx - 120 * s} ${cy - 300 * s} C${cx - 40 * s} ${cy - 300 * s} ${cx} ${cy - 240 * s} ${cx} ${cy - 190 * s} C${cx} ${cy - 240 * s} ${cx + 40 * s} ${cy - 300 * s} ${cx + 120 * s} ${cy - 300 * s} C${cx + 300 * s} ${cy - 300 * s} ${cx + 300 * s} ${cy - 20 * s} ${cx} ${cy + 220 * s}Z`;
}

function heroHeart(rng: Rng, m: Mood, u: string): string {
  let svg = shadow(540, 1060, 340);
  svg += `<g class="sc-beat"><path d="${heartPath(540, 640, 1.5)}" fill="url(#${u}-heart)"/>`;
  svg += `<path d="M300 420 C260 500 300 580 370 620" fill="none" stroke="#fff" stroke-width="30" stroke-linecap="round" opacity="0.4"/><ellipse cx="400" cy="380" rx="42" ry="24" fill="#fff" opacity="0.45" transform="rotate(-30 400 380)"/></g>`;
  [[250, 980], [830, 980]].forEach(([x, y], i) => {
    svg += `<g ${FLOAT(i * 1.6)}><rect x="${(x ?? 0) - 56}" y="${(y ?? 0) - 90}" width="112" height="100" rx="18" fill="#fff"/><path d="M${(x ?? 0) + 56} ${(y ?? 0) - 70} q44 6 38 34 q-6 24 -38 26" fill="none" stroke="#fff" stroke-width="14"/><rect x="${(x ?? 0) - 56}" y="${(y ?? 0) - 90}" width="112" height="28" rx="14" fill="${i ? '#ff7a9a' : m.accent}"/></g>`;
  });
  for (let i = 0; i < 7; i += 1) {
    const s = rng.range(0.14, 0.34);
    svg += `<path class="sc-rise" style="animation-delay:-${n(rng.range(0, 6))}s" d="${heartPath(rng.range(100, 980), rng.range(300, 960), s)}" fill="#ffb3c6" opacity="${n(rng.range(0.4, 0.85))}"/>`;
  }
  for (let i = 0; i < 4; i += 1) svg += star(rng.range(100, 980), rng.range(240, 900), rng.range(18, 40), '#fff6b0');
  return svg;
}

function heroCart(rng: Rng, m: Mood, u: string): string {
  let svg = shadow(540, 1060, 380);
  const items = rng.int(4, 6);
  for (let i = 0; i < items; i += 1) {
    const x = 300 + i * (480 / items) + rng.range(-10, 30);
    const kind = rng.int(0, 2);
    const color = rng.pick(['#ff6b6b', '#ffd45a', '#6bd68a', '#6aa8ff', '#ff9ad5']);
    svg += `<g ${FLOAT(rng.range(0, 5))}>`;
    if (kind === 0) svg += `<circle cx="${n(x)}" cy="${n(660 - rng.range(0, 80))}" r="${n(rng.range(50, 74))}" fill="${color}"/><path d="M${n(x)} 590 q10 -34 30 -36" stroke="#2f8f4f" stroke-width="10" fill="none" stroke-linecap="round"/>`;
    else if (kind === 1) svg += `<rect x="${n(x - 36)}" y="${n(560 - rng.range(0, 60))}" width="72" height="190" rx="22" fill="${color}"/><rect x="${n(x - 22)}" y="${n(520 - rng.range(0, 60))}" width="44" height="50" rx="10" fill="#fff" opacity="0.85"/>`;
    else svg += `<rect x="${n(x - 56)}" y="${n(640 - rng.range(0, 70))}" width="112" height="120" rx="14" fill="${color}"/><rect x="${n(x - 56)}" y="${n(640 - rng.range(0, 70))}" width="112" height="26" rx="10" fill="#fff" opacity="0.3"/>`;
    svg += `</g>`;
  }
  svg += `<path d="M240 740 L840 740 L780 1030 Q776 1050 756 1050 L324 1050 Q304 1050 300 1030Z" fill="url(#${u}-basket)"/>`;
  for (let i = 0; i < 6; i += 1) svg += `<line x1="${290 + i * 100}" y1="760" x2="${310 + i * 88}" y2="1040" stroke="#000" stroke-width="5" opacity="0.18"/>`;
  for (let i = 0; i < 3; i += 1) svg += `<line x1="256" y1="${810 + i * 80}" x2="824" y2="${810 + i * 80}" stroke="#000" stroke-width="5" opacity="0.18"/>`;
  svg += `<path d="M300 740 Q540 410 780 740" fill="none" stroke="${darken(m.accent, 0.2)}" stroke-width="26" stroke-linecap="round"/>`;
  svg += `<g class="sc-wiggle"><path d="M800 420 L960 420 L1010 480 L960 540 L800 540Z" fill="${m.accent}"/><circle cx="830" cy="480" r="12" fill="${darken(m.near, 0.2)}"/><text x="900" y="498" text-anchor="middle" font-size="50" font-weight="900" fill="#2a1d14" font-family="Pretendard, sans-serif">SALE</text></g>`;
  return svg;
}

function heroTech(rng: Rng, m: Mood, u: string): string {
  let svg = shadow(540, 1060, 320);
  for (let i = 0; i < 3; i += 1) {
    svg += `<ellipse class="sc-spin-slow" style="animation-duration:${14 + i * 6}s;transform-origin:540px 680px" cx="540" cy="680" rx="${440 - i * 50}" ry="${170 + i * 30}" fill="none" stroke="${m.accent}" stroke-width="3" opacity="${0.5 - i * 0.12}" transform="rotate(${-24 + i * 24} 540 680)"/>`;
  }
  svg += `<g class="sc-float-s"><rect x="360" y="500" width="360" height="360" rx="44" fill="#0c1230"/>`;
  for (let i = 0; i < 7; i += 1) {
    svg += `<rect x="${384 + i * 46}" y="470" width="18" height="40" rx="6" fill="${lighten(m.accent, 0.2)}"/><rect x="${384 + i * 46}" y="850" width="18" height="40" rx="6" fill="${lighten(m.accent, 0.2)}"/>`;
    svg += `<rect x="330" y="${530 + i * 46}" width="40" height="18" rx="6" fill="${lighten(m.accent, 0.2)}"/><rect x="710" y="${530 + i * 46}" width="40" height="18" rx="6" fill="${lighten(m.accent, 0.2)}"/>`;
  }
  svg += `<rect x="400" y="540" width="280" height="280" rx="28" fill="url(#${u}-screen)"/>`;
  svg += `<path d="M430 600 H520 V680 H620 M430 700 H480 V770 H640 M560 570 V620 H650" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity="0.7"/>`;
  svg += `<circle class="sc-twinkle" cx="540" cy="680" r="46" fill="#fff" opacity="0.9"/><text x="540" y="706" text-anchor="middle" font-size="68" font-weight="900" fill="${darken(m.near, 0.2)}" font-family="Pretendard, sans-serif">AI</text></g>`;
  for (let i = 0; i < 4; i += 1) {
    const x = [110, 760, 150, 780][i] as number;
    const y = [380, 340, 880, 840][i] as number;
    svg += `<g ${FLOAT(i * 1.3)}><rect x="${x}" y="${y}" width="190" height="110" rx="20" fill="#0c1230" opacity="0.88"/><rect x="${x + 20}" y="${y + 24}" width="${rng.int(70, 130)}" height="12" rx="6" fill="${m.accent}"/><rect x="${x + 20}" y="${y + 50}" width="${rng.int(90, 150)}" height="10" rx="5" fill="#fff" opacity="0.5"/><rect x="${x + 20}" y="${y + 72}" width="${rng.int(40, 90)}" height="10" rx="5" fill="#fff" opacity="0.3"/></g>`;
  }
  return svg;
}

function heroIdea(rng: Rng, m: Mood, u: string): string {
  let svg = shadow(540, 1060, 300);
  for (let i = 0; i < 14; i += 1) {
    const a = (i / 14) * Math.PI * 2;
    svg += `<line class="sc-twinkle" style="animation-delay:${n(i * 0.18)}s" x1="${n(540 + Math.cos(a) * 290)}" y1="${n(640 + Math.sin(a) * 290)}" x2="${n(540 + Math.cos(a) * 380)}" y2="${n(640 + Math.sin(a) * 380)}" stroke="${m.accent}" stroke-width="12" stroke-linecap="round"/>`;
  }
  svg += `<g class="sc-float-s"><circle cx="540" cy="620" r="210" fill="url(#${u}-bulb)"/><path d="M450 700 L500 560 L540 640 L580 560 L630 700" fill="none" stroke="#fff6c0" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>`;
  svg += `<path d="M360 520 A200 200 0 0 1 520 440" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round" opacity="0.55"/>`;
  svg += `<rect x="450" y="810" width="180" height="40" rx="12" fill="#c4c9da"/><rect x="456" y="856" width="168" height="34" rx="12" fill="#a3a9bf"/><rect x="480" y="896" width="120" height="30" rx="14" fill="#7d83a0"/></g>`;
  for (let i = 0; i < 3; i += 1) {
    const x = [150, 820, 780][i] as number;
    const y = [820, 760, 330][i] as number;
    const col = rng.pick(['#ffe27a', '#9be7ff', '#ffb3d1', '#b8f5b0']);
    svg += `<g ${FLOAT(i * 1.7)}><rect x="${x}" y="${y}" width="150" height="150" fill="${col}" transform="rotate(${rng.int(-10, 10)} ${x + 75} ${y + 75})"/><rect x="${x + 22}" y="${y + 40}" width="100" height="10" rx="5" fill="#000" opacity="0.25" transform="rotate(${rng.int(-10, 10)} ${x + 75} ${y + 75})"/><rect x="${x + 22}" y="${y + 66}" width="70" height="10" rx="5" fill="#000" opacity="0.2" transform="rotate(${rng.int(-10, 10)} ${x + 75} ${y + 75})"/></g>`;
  }
  return svg;
}

function heroCheck(rng: Rng, m: Mood, _u: string): string {
  let svg = shadow(540, 1090, 330);
  svg += `<g class="sc-float-s"><rect x="300" y="360" width="480" height="720" rx="40" fill="#c78b52"/><rect x="326" y="400" width="428" height="650" rx="22" fill="#fffdf6"/><rect x="450" y="330" width="180" height="76" rx="22" fill="#8a8fa8"/><circle cx="540" cy="360" r="14" fill="#fffdf6"/>`;
  const rows = 5;
  for (let i = 0; i < rows; i += 1) {
    const y = 470 + i * 112;
    const done = i < 3 || rng.chance(0.3);
    svg += `<rect x="360" y="${y}" width="64" height="64" rx="16" fill="${done ? m.accent : 'none'}" stroke="${done ? m.accent : '#b8bcd0'}" stroke-width="7"/>`;
    if (done) svg += `<path d="M374 ${y + 34} L390 ${y + 50} L416 ${y + 16}" fill="none" stroke="${darken(m.near, 0.2)}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
    svg += `<rect x="450" y="${y + 8}" width="${rng.int(160, 250)}" height="16" rx="8" fill="#2a2f4a" opacity="${done ? 0.35 : 0.75}"/><rect x="450" y="${y + 36}" width="${rng.int(90, 160)}" height="12" rx="6" fill="#2a2f4a" opacity="0.2"/>`;
  }
  svg += `</g>`;
  svg += `<g ${FLOAT(2)}><rect x="800" y="640" width="46" height="300" rx="14" fill="${m.accent}" transform="rotate(24 823 790)"/><path d="M789 925 L823 986 L857 925Z" fill="#f3d9b4" transform="rotate(24 823 790)"/></g>`;
  return svg;
}

function heroVote(rng: Rng, m: Mood, u: string): string {
  const left = lighten(m.accent, 0.05);
  const right = '#ff6fa3';
  let svg = shadow(540, 1090, 420);
  svg += `<g class="sc-float-s" transform="rotate(-8 330 720)"><rect x="110" y="420" width="440" height="620" rx="44" fill="${left}"/><rect x="110" y="420" width="440" height="620" rx="44" fill="url(#${u}-cardshade)"/><text x="330" y="800" text-anchor="middle" font-size="340" font-weight="900" fill="${darken(m.near, 0.25)}" font-family="Pretendard, sans-serif">A</text><rect x="170" y="900" width="320" height="22" rx="11" fill="${darken(m.near, 0.25)}" opacity="0.35"/><rect x="170" y="946" width="220" height="16" rx="8" fill="${darken(m.near, 0.25)}" opacity="0.25"/></g>`;
  svg += `<g class="sc-float-s" style="animation-delay:-1.4s" transform="rotate(8 750 720)"><rect x="530" y="420" width="440" height="620" rx="44" fill="${right}"/><rect x="530" y="420" width="440" height="620" rx="44" fill="url(#${u}-cardshade)"/><text x="750" y="800" text-anchor="middle" font-size="340" font-weight="900" fill="#5a0f33" font-family="Pretendard, sans-serif">B</text><rect x="590" y="900" width="320" height="22" rx="11" fill="#5a0f33" opacity="0.35"/><rect x="590" y="946" width="220" height="16" rx="8" fill="#5a0f33" opacity="0.25"/></g>`;
  svg += `<g class="sc-beat"><circle cx="540" cy="700" r="92" fill="#fff"/><circle cx="540" cy="700" r="92" fill="none" stroke="${darken(m.near, 0.1)}" stroke-width="10"/><text x="540" y="734" text-anchor="middle" font-size="84" font-weight="900" fill="${darken(m.near, 0.1)}" font-family="Pretendard, sans-serif">VS</text></g>`;
  for (let i = 0; i < 3; i += 1) {
    const x = [150, 760, 520][i] as number;
    const y = [260, 300, 190][i] as number;
    svg += `<g ${FLOAT(i * 1.5 + rng.range(0, 1))}><rect x="${x}" y="${y}" width="190" height="92" rx="30" fill="#fff" opacity="0.92"/><path d="M${x + 40} ${y + 92} l-4 30 l34 -30Z" fill="#fff" opacity="0.92"/><circle cx="${x + 54}" cy="${y + 46}" r="9" fill="${m.near}" opacity="0.55"/><circle cx="${x + 95}" cy="${y + 46}" r="9" fill="${m.near}" opacity="0.55"/><circle cx="${x + 136}" cy="${y + 46}" r="9" fill="${m.near}" opacity="0.55"/></g>`;
  }
  return svg;
}

const HEROES: Record<Motif, (rng: Rng, m: Mood, u: string) => string> = {
  desk: heroDesk,
  money: heroMoney,
  clock: heroClock,
  home: heroHome,
  phone: heroPhone,
  heart: heroHeart,
  cart: heroCart,
  tech: heroTech,
  idea: heroIdea,
  check: heroCheck,
  vote: heroVote,
};

function defs(m: Mood, u: string, dark: string): string {
  const stop = (o: number, c: string, a = 1) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`;
  return (
    `<defs>` +
    `<linearGradient id="${u}-sky" x1="0" y1="0" x2="0" y2="1">${stop(0, m.top)}${stop(0.55, m.mid)}${stop(1, m.bot)}</linearGradient>` +
    `<radialGradient id="${u}-sunglow">${stop(0, m.sun, 0.55)}${stop(1, m.sun, 0)}</radialGradient>` +
    `<linearGradient id="${u}-ground" x1="0" y1="0" x2="0" y2="1">${stop(0, darken(m.near, 0.1))}${stop(1, darken(m.near, 0.55))}</linearGradient>` +
    `<linearGradient id="${u}-wall" x1="0" y1="0" x2="1" y2="1">${stop(0, '#ffffff', 0.08)}${stop(1, '#000000', 0.3)}</linearGradient>` +
    `<linearGradient id="${u}-floor" x1="0" y1="0" x2="0" y2="1">${stop(0, mix(m.near, '#8a5a3a', 0.4))}${stop(1, darken(m.near, 0.6))}</linearGradient>` +
    `<linearGradient id="${u}-wood" x1="0" y1="0" x2="0" y2="1">${stop(0, '#d79a62')}${stop(1, '#a56c3a')}</linearGradient>` +
    `<linearGradient id="${u}-screen" x1="0" y1="0" x2="1" y2="1">${stop(0, darken(m.mid, 0.35))}${stop(1, darken(m.top, 0.2))}</linearGradient>` +
    `<linearGradient id="${u}-coin" x1="0" y1="0" x2="1" y2="1">${stop(0, '#fff0a8')}${stop(0.5, '#f7c548')}${stop(1, '#d99517')}</linearGradient>` +
    `<radialGradient id="${u}-clockshade" cx="0.35" cy="0.3" r="0.8">${stop(0, '#fff', 0.5)}${stop(1, '#c9c2b2', 0.4)}</radialGradient>` +
    `<linearGradient id="${u}-wallshade" x1="0" y1="0" x2="1" y2="0">${stop(0, '#fff', 0.2)}${stop(1, '#000', 0.22)}</linearGradient>` +
    `<linearGradient id="${u}-heart" x1="0.2" y1="0" x2="0.8" y2="1">${stop(0, '#ff9ab8')}${stop(0.55, '#ff4d7e')}${stop(1, '#c21f5b')}</linearGradient>` +
    `<linearGradient id="${u}-basket" x1="0" y1="0" x2="0" y2="1">${stop(0, '#e2a45c')}${stop(1, '#b77a36')}</linearGradient>` +
    `<radialGradient id="${u}-bulb" cx="0.4" cy="0.35" r="0.75">${stop(0, '#fffbe0')}${stop(0.6, '#ffe27a')}${stop(1, '#ffb62e')}</radialGradient>` +
    `<linearGradient id="${u}-cardshade" x1="0" y1="0" x2="1" y2="1">${stop(0, '#fff', 0.28)}${stop(1, '#000', 0.18)}</linearGradient>` +
    `<radialGradient id="${u}-vig" cx="0.5" cy="0.45" r="0.8">${stop(0.55, dark, 0)}${stop(1, dark, 0.55)}</radialGradient>` +
    `<filter id="${u}-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>` +
    `</defs>`
  );
}

function particles(rng: Rng, m: Mood): string {
  let svg = '';
  for (let i = 0; i < 16; i += 1) {
    const x = rng.range(20, 1060);
    const y = rng.range(120, 1250);
    const r = rng.range(3, 14);
    svg += `<circle class="sc-rise" style="animation-delay:-${n(rng.range(0, 9))}s;animation-duration:${n(rng.range(7, 14))}s" cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${rng.chance(0.5) ? m.accent : '#fff'}" opacity="${n(rng.range(0.25, 0.7))}"/>`;
  }
  return svg;
}

export interface SceneRequest {
  seed: number;
  uid: string;
  template: TemplateId;
  motif: Motif;
  index: number;
}

/** 컷 하나의 배경 SVG 문자열. */
export function buildScene({ seed, uid, template, motif, index }: SceneRequest): string {
  const rng = makeRng(hash(`${seed}:${uid}:${motif}`));
  const pool = POOLS[template];
  const baseMood = hash(`${seed}:mood`) % pool.length;
  const moodKey = pool[(baseMood + Math.floor(index / 2) + (rng.chance(0.25) ? 1 : 0)) % pool.length] as string;
  const mood = MOODS[moodKey] as Mood;
  const u = `s${uid.replace(/[^a-z0-9]/gi, '')}`;

  const roomy = motif === 'desk' || (motif === 'check' && rng.chance(0.5)) || (motif === 'phone' && rng.chance(0.35));
  let back: string;
  if (roomy) {
    back = roomBackdrop(rng, mood, u);
  } else {
    const style = rng.pick(['city', 'city', 'sky', 'abstract'] as const);
    if (style === 'abstract') back = abstractBackdrop(rng, mood, u);
    else if (style === 'sky') back = skyBackdrop(rng, mood, u) + `<g opacity="0.95">${skyline(rng, mood, 1130, 2)}</g>` + ground(mood, u);
    else back = skyBackdrop(rng, mood, u) + skyline(rng, mood, 1120, 3) + ground(mood, u);
  }

  const hero = HEROES[motif](rng, mood, u);
  const dark = darken(mood.near, 0.6);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice" class="sc" data-motif="${motif}" data-mood="${moodKey}">` +
    defs(mood, u, dark) +
    `<g class="sc-back">${back}</g>` +
    `<g class="sc-hero">${hero}</g>` +
    `<g class="sc-fx">${particles(rng, mood)}</g>` +
    `<rect width="1080" height="1920" fill="url(#${u}-vig)"/>` +
    `</svg>`
  );
}

/** 새 쇼츠에 붙일 무작위 seed. */
export function newSeed(): number {
  return (Math.floor(Math.random() * 2 ** 31) ^ Date.now()) >>> 0;
}
