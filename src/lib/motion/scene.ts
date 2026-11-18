import type { Shorts, Shot, TemplateId, Tone } from '../../types';
import { rotateHue, shade } from './color';
import { createRng, type Rng } from './rng';

/**
 * 대본 → 그림. 컷마다 배경·인물·소품·카메라·이펙트를 시드로 새로 조립합니다.
 * 같은 시드면 같은 그림, 새로 만들면(시드가 바뀌면) 장면이 전부 달라집니다.
 */

export type WorldId =
  | 'city-night'
  | 'sunset-rooftop'
  | 'office'
  | 'cozy-room'
  | 'cafe'
  | 'street-rain'
  | 'neon-grid'
  | 'park-day'
  | 'subway';

export type TimeOfDay = 'dawn' | 'day' | 'sunset' | 'night';

export type EffectId =
  | 'dust'
  | 'bokeh'
  | 'rain'
  | 'snow'
  | 'petals'
  | 'money'
  | 'heart'
  | 'sparkle'
  | 'confetti'
  | 'speedlines'
  | 'steam'
  | 'sweat'
  | 'anger'
  | 'bolt';

export type PropId =
  | 'money'
  | 'cup'
  | 'phone'
  | 'laptop'
  | 'clock'
  | 'plant'
  | 'cat'
  | 'bag'
  | 'chart'
  | 'heart'
  | 'book'
  | 'umbrella'
  | 'food'
  | 'trophy';

export type PoseId = 'point' | 'phone' | 'cup' | 'money' | 'crossed' | 'palms' | 'thumbsup' | 'fist' | 'hand-on-head';

export type ExpressionId = 'tired' | 'shock' | 'smile' | 'smirk' | 'angry' | 'sad' | 'neutral' | 'smug' | 'dizzy';

export type HairId = 'short' | 'bob' | 'long' | 'bun' | 'wavy' | 'messy';

export type CameraMove = 'push' | 'pull' | 'punch' | 'drift' | 'tilt' | 'shake' | 'handheld' | 'pan';

export type Framing = 'wide' | 'medium' | 'close' | 'left' | 'right' | 'two-shot';

export interface ScenePalette {
  skyTop: string;
  skyBottom: string;
  horizon: string;
  far: string;
  ground: string;
  near: string;
  ink: string;
  accent: string;
  glow: string;
}

export interface CharacterSpec {
  /** 1080×1920 기준 머리 중심 x */
  x: number;
  /** 머리 중심 y */
  y: number;
  scale: number;
  facing: 1 | -1;
  hair: HairId;
  hairColor: string;
  skin: string;
  outfit: string;
  outfitDark: string;
  accessory: 'none' | 'glasses' | 'earbuds' | 'cap';
  expression: ExpressionId;
  pose: PoseId;
  /** 애니메이션 위상 — 사람마다 다르게 흔들리게 */
  phase: number;
  /** 표정·동작의 세기 */
  intensity: number;
  /** 사람마다 다른 얼굴 비율 — 같은 얼굴이 반복되지 않게 */
  face: { eyeGap: number; eye: number; mouth: number; brow: number; blush: number };
}

export interface CameraPlan {
  move: CameraMove;
  intensity: number;
  /** 패닝/드리프트 방향 */
  direction: 1 | -1;
}

export interface CutScene {
  index: number;
  world: WorldId;
  timeOfDay: TimeOfDay;
  palette: ScenePalette;
  framing: Framing;
  camera: CameraPlan;
  hero: CharacterSpec;
  rival?: CharacterSpec;
  props: PropId[];
  effects: EffectId[];
  weather: EffectId[];
  /** 이 컷이 무엇을 그리는지 한 줄 (화면·가이드에 표시) */
  label: string;
  /** 컷마다 다른 조명 세기 */
  light: number;
}

export interface ScenePlan {
  seed: string;
  cuts: CutScene[];
  shots: Shot[];
  starts: number[];
  total: number;
  banner: string;
  accent: string;
  template: TemplateId;
  tone: Tone;
}

interface PaletteDef extends ScenePalette {
  id: string;
  tod: TimeOfDay;
}

const PALETTES: PaletteDef[] = [
  {
    id: 'golden',
    tod: 'sunset',
    skyTop: '#2d1b69',
    skyBottom: '#ff9a5a',
    horizon: '#ffd39b',
    far: '#7a4a8a',
    ground: '#2a1436',
    near: '#150a1e',
    ink: '#241033',
    accent: '#ffe066',
    glow: '#ffb066',
  },
  {
    id: 'midnight',
    tod: 'night',
    skyTop: '#070a1f',
    skyBottom: '#27306b',
    horizon: '#6f7fd6',
    far: '#1a2350',
    ground: '#0a0d20',
    near: '#05060f',
    ink: '#0b0e22',
    accent: '#7dd3fc',
    glow: '#4f7dff',
  },
  {
    id: 'neon',
    tod: 'night',
    skyTop: '#0a0620',
    skyBottom: '#3b0d5c',
    horizon: '#ff4fd8',
    far: '#2b0a45',
    ground: '#12041f',
    near: '#08020f',
    ink: '#1a0530',
    accent: '#36f0d0',
    glow: '#b14bff',
  },
  {
    id: 'morning',
    tod: 'day',
    skyTop: '#cfe9ff',
    skyBottom: '#fdf3e0',
    horizon: '#ffe9bf',
    far: '#a8c8d8',
    ground: '#dfe9d9',
    near: '#b9c9b3',
    ink: '#3a3a44',
    accent: '#ff8a4c',
    glow: '#fff1c9',
  },
  {
    id: 'indoor-warm',
    tod: 'day',
    skyTop: '#6b4030',
    skyBottom: '#a45f3d',
    horizon: '#ffcf9b',
    far: '#6b4433',
    ground: '#4a2a22',
    near: '#2a1714',
    ink: '#241210',
    accent: '#ffd88a',
    glow: '#ffb271',
  },
  {
    id: 'indoor-cool',
    tod: 'day',
    skyTop: '#41566a',
    skyBottom: '#64839a',
    horizon: '#c8dbe8',
    far: '#4a5f72',
    ground: '#33424f',
    near: '#1a2530',
    ink: '#16202a',
    accent: '#8fe8da',
    glow: '#b6e2ff',
  },
  {
    id: 'rain',
    tod: 'night',
    skyTop: '#101a2a',
    skyBottom: '#2b3f52',
    horizon: '#7f9bb5',
    far: '#1b2a3a',
    ground: '#101a24',
    near: '#070d13',
    ink: '#0d151d',
    accent: '#86e1ff',
    glow: '#5d8fb5',
  },
  {
    id: 'dusk-park',
    tod: 'sunset',
    skyTop: '#3b2b6b',
    skyBottom: '#ffb27a',
    horizon: '#ffe1b5',
    far: '#5c6b5a',
    ground: '#2e3a2b',
    near: '#1b241a',
    ink: '#20261c',
    accent: '#ffd166',
    glow: '#ffcf8a',
  },
];

const WORLD_WORDS: { id: WorldId; words: string[]; tod?: TimeOfDay }[] = [
  { id: 'office', words: ['회사', '사무실', '직장', '상사', '팀장', '회의', '업무', '월급', '연봉', '칼퇴', '재택', '야근', '출근', '이직', '커리어', '동료'] },
  { id: 'subway', words: ['지하철', '출근길', '퇴근길', '만원', '환승', '버스'] },
  { id: 'cozy-room', words: ['자취', '원룸', '혼자', '수납', '살림', '월세', '이사', '집', '방', '청소', '요리', '냉장고', '인테리어'] },
  { id: 'cafe', words: ['카페', '소개팅', '커피', '썸', '데이트', '연애', '카톡', '고백', '썸남', '썸녀', '읽씹'] },
  { id: 'street-rain', words: ['비', '이별', '후회', '힘든', '서운', '슬픔', '울', '우산', '밤거리'] },
  { id: 'sunset-rooftop', words: ['노을', '저녁', '쉼', '휴식', '하루', '퇴근'] },
  { id: 'park-day', words: ['산책', '주말', '공원', '운동', '여행', '아침', '피크닉'] },
  { id: 'neon-grid', words: ['ai', '인공지능', '기술', '앱', '개발', '서비스', '트렌드', '디지털', '온라인', '프롬프트', '출시', '보안'] },
  { id: 'city-night', words: ['밤', '야경', '도시', '회식', '술', '퇴근'] },
];

const TEMPLATE_WORLDS: Record<TemplateId, WorldId[]> = {
  balance: ['office', 'city-night', 'sunset-rooftop', 'subway', 'cafe'],
  living: ['cozy-room', 'cafe', 'park-day', 'city-night'],
  love: ['cafe', 'street-rain', 'sunset-rooftop', 'cozy-room'],
  it: ['neon-grid', 'office', 'subway', 'city-night'],
};

const TEMPLATE_PALETTES: Record<TemplateId, string[]> = {
  balance: ['golden', 'midnight', 'indoor-warm', 'neon'],
  living: ['indoor-warm', 'morning', 'dusk-park', 'indoor-cool'],
  love: ['golden', 'indoor-warm', 'rain', 'morning'],
  it: ['neon', 'midnight', 'indoor-cool', 'golden'],
};

const PROP_WORDS: { id: PropId; words: string[] }[] = [
  { id: 'money', words: ['돈', '월급', '연봉', '지폐', '수입', '월세', '인상', '지갑', '비싸'] },
  { id: 'cup', words: ['커피', '카페', '아메리카노', '마시', '점심', '차'] },
  { id: 'phone', words: ['폰', '카톡', '문자', '연락', '알림', '답장', '읽씹', '화상'] },
  { id: 'laptop', words: ['노트북', '업무', '회의', '앱', '개발', '프롬프트', 'ai'] },
  { id: 'clock', words: ['시간', '야근', '칼퇴', '퇴근', '9시', '새벽', '아침'] },
  { id: 'plant', words: ['집', '자취', '방', '살림', '인테리어', '꾸미'] },
  { id: 'cat', words: ['고양이', '냥', '반려', '집사'] },
  { id: 'bag', words: ['장바구니', '쇼핑', '사면', '구매', '풀세트'] },
  { id: 'chart', words: ['성과', '지표', '트렌드', '성장', '데이터', '통계'] },
  { id: 'heart', words: ['연애', '썸', '고백', '마음', '좋아', '하트'] },
  { id: 'book', words: ['책', '공부', '독서', '배우'] },
  { id: 'umbrella', words: ['비', '우산', '장마'] },
  { id: 'food', words: ['음식', '밥', '야식', '야근', '배달', '점심'] },
  { id: 'trophy', words: ['성공', '최고', '1등', '합격', '칭찬'] },
];

const EFFECT_WORDS: { id: EffectId; words: string[] }[] = [
  { id: 'money', words: ['돈', '월급', '연봉', '월세', '지갑', '비싸'] },
  { id: 'heart', words: ['연애', '썸', '고백', '마음', '좋아'] },
  { id: 'bolt', words: ['사이다', '팩트', '한방', '결론', '경고'] },
  { id: 'anger', words: ['화', '짜증', '빡', '상사', '팀장'] },
  { id: 'sweat', words: ['당황', '식은땀', '긴장', '헉'] },
  { id: 'sparkle', words: ['팁', '꿀팁', '좋은', '추천', '성공'] },
  { id: 'steam', words: ['커피', '밥', '요리', '야식', '따뜻'] },
  { id: 'petals', words: ['봄', '산책', '공원', '데이트'] },
];

const EXPRESSION_WORDS: { id: ExpressionId; words: string[] }[] = [
  { id: 'shock', words: ['놀란', '충격', '헉', '소름', '어마', '깜짝', '반전'] },
  { id: 'angry', words: ['화', '짜증', '빡', '싫', '최악', '지옥'] },
  { id: 'sad', words: ['슬픔', '울', '서운', '속상', '후회', '이별'] },
  { id: 'tired', words: ['지친', '피곤', '야근', '멘붕', '무기력', '녹초'] },
  { id: 'smile', words: ['웃', '기쁨', '행복', '좋아', '꿀팁', '칼퇴'] },
  { id: 'smirk', words: ['비틀', '한 번', '역시', '알겠', '아는 척'] },
  { id: 'dizzy', words: ['혼란', '복잡', '어렵', '모르', '고민'] },
  { id: 'smug', words: ['성공', '뿌듯', '1등', '최고', '해냈'] },
];

const POSE_WORDS: { id: PoseId; words: string[] }[] = [
  { id: 'phone', words: ['폰', '카톡', '문자', '연락', '답장', '읽씹'] },
  { id: 'cup', words: ['커피', '마시', '카페', '점심'] },
  { id: 'money', words: ['돈', '월급', '연봉', '지갑', '월세'] },
  { id: 'crossed', words: ['싫', '거부', '하지 마', '금지', '안 돼'] },
  { id: 'palms', words: ['어쩔', '모르', '고민', '선택', '둘 중'] },
  { id: 'thumbsup', words: ['좋아', '최고', '성공', '추천', '꿀팁'] },
  { id: 'fist', words: ['사이다', '화이팅', '해냈', '가자'] },
  { id: 'hand-on-head', words: ['골치', '지친', '멘붕', '복잡'] },
  { id: 'point', words: ['이거', '이것', '핵심', '포인트', '첫'] },
];

const CAMERA_WORDS: { move: CameraMove; words: string[] }[] = [
  { move: 'push', words: ['push', '줌인', 'zoom in', '다가', '클로즈'] },
  { move: 'pull', words: ['pull', '줌아웃', 'zoom out', '멀어', '와이드'] },
  { move: 'punch', words: ['punch', '펀치', '강조', '때리', '훅'] },
  { move: 'drift', words: ['pan-left', 'pan-right', '패닝', '옆으로', '흐르'] },
  { move: 'tilt', words: ['tilt', '틸트', '위로', '아래로'] },
  { move: 'shake', words: ['shake', '흔들', '충격', '진동'] },
  { move: 'handheld', words: ['handheld', '핸드헬드', '들고', '현장'] },
  { move: 'pan', words: ['orbit', '회전', '돌리', '한 바퀴'] },
];

const MOOD_LABEL: Record<string, string> = {
  tense: '긴장',
  bright: '밝은',
  warm: '따뜻한',
  gloomy: '가라앉은',
  comic: '코믹',
  dreamy: '몽환',
  hype: '들뜬',
  cold: '차가운',
};

const WORLD_LABEL: Record<WorldId, string> = {
  'city-night': '도시 야경',
  'sunset-rooftop': '노을 옥상',
  office: '사무실',
  'cozy-room': '자취방',
  cafe: '카페',
  'street-rain': '비 오는 거리',
  'neon-grid': '네온 테크',
  'park-day': '낮 공원',
  subway: '지하철',
};

const HAIRS: HairId[] = ['short', 'bob', 'long', 'bun', 'wavy', 'messy'];
const HAIR_COLORS = ['#1f1a24', '#2c2118', '#3d2a1f', '#141821', '#4a2c2a', '#2a2a33'];
const SKINS = ['#f7d9c4', '#f2cbb0', '#e8b99b', '#ffdfcb', '#d9a882'];
const OUTFITS = ['#3b5bdb', '#6d28d9', '#0f766e', '#b91c1c', '#1f2937', '#c2410c', '#0e7490', '#7e22ce', '#4d7c0f'];
const ACCESSORIES: CharacterSpec['accessory'][] = ['none', 'none', 'none', 'glasses', 'earbuds', 'cap'];

function hits(text: string, words: string[]): number {
  const haystack = text.toLowerCase();
  let count = 0;
  for (const word of words) {
    if (word && haystack.includes(word.toLowerCase())) count += 1;
  }
  return count;
}

function readList<T extends string>(text: string, table: { id: T; words: string[] }[], fallback: T): T {
  let best: T = fallback;
  let bestScore = 0;
  for (const row of table) {
    const score = hits(text, row.words);
    if (score > bestScore) {
      best = row.id;
      bestScore = score;
    }
  }
  return best;
}

function readProps(text: string, rng: Rng, max: number): PropId[] {
  const scored = PROP_WORDS.map((row) => ({ id: row.id, score: hits(text, row.words) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.id);
  const chosen = scored.slice(0, max);
  if (chosen.length === 0) {
    const pool: PropId[][] = [
      ['cup', 'plant'],
      ['phone', 'clock'],
      ['money', 'chart'],
      ['plant', 'cat'],
      ['book', 'cup'],
    ];
    chosen.push(...rng.pick(pool));
  }
  return [...new Set(chosen)];
}

function readEffects(text: string, base: EffectId[], rng: Rng): EffectId[] {
  const matched = EFFECT_WORDS.filter((row) => hits(text, row.words) > 0).map((row) => row.id);
  const chosen = [base[0] ?? rng.pick<EffectId>(['dust', 'bokeh', 'sparkle']), ...matched.slice(0, 2)];
  return [...new Set(chosen)];
}

/** 장면 키워드('퇴근길 지하철')를 배경 세계로 옮깁니다. */
function worldForScene(scene: string): WorldId | null {
  let best: WorldId | null = null;
  let bestScore = 0;
  for (const row of WORLD_WORDS) {
    const score = hits(scene, row.words);
    if (score > bestScore) {
      best = row.id;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function paletteOf(id: string): PaletteDef {
  return PALETTES.find((row) => row.id === id) ?? PALETTES[0]!;
}

function todFromText(text: string): TimeOfDay | null {
  if (/새벽|밤|야근|야경|심야/.test(text)) return 'night';
  if (/아침|출근|모닝/.test(text)) return 'dawn';
  if (/저녁|퇴근|노을|석양/.test(text)) return 'sunset';
  if (/점심|낮|주말|오후/.test(text)) return 'day';
  return null;
}

function variantPalette(base: PaletteDef, hue: number, index: number): ScenePalette {
  const shift = hue + index * 7;
  const lighten = (hex: string, amount: number) => shade(rotateHue(hex, shift * 0.35, 0.02, amount), 0);
  return {
    skyTop: lighten(base.skyTop, 0),
    skyBottom: lighten(base.skyBottom, 0),
    horizon: lighten(base.horizon, 0.02),
    far: lighten(base.far, 0),
    ground: lighten(base.ground, 0),
    near: lighten(base.near, 0),
    ink: base.ink,
    accent: rotateHue(base.accent, shift * 0.6, 0.05, 0.03),
    glow: lighten(base.glow, 0),
  };
}

function framingPlan(framing: Framing, rng: Rng): { hero: { x: number; y: number; scale: number }; rival?: { x: number; y: number; scale: number } } {
  switch (framing) {
    case 'wide':
      return { hero: { x: 540, y: 690, scale: 0.8 + rng.range(-0.03, 0.05) } };
    case 'close':
      return { hero: { x: 540 + rng.range(-40, 40), y: 720, scale: 1.4 + rng.range(-0.08, 0.12) } };
    case 'left':
      return { hero: { x: 300, y: 760, scale: 0.98 } };
    case 'right':
      return { hero: { x: 780, y: 760, scale: 0.98 } };
    case 'two-shot':
      return { hero: { x: 320, y: 780, scale: 0.9 }, rival: { x: 780, y: 800, scale: 0.84 } };
    default:
      return { hero: { x: 540, y: 730, scale: 1.02 + rng.range(-0.04, 0.06) } };
  }
}

function makeCharacter(
  rng: Rng,
  look: {
    hair: HairId;
    hairColor: string;
    skin: string;
    outfit: string;
    outfitDark: string;
    accessory: CharacterSpec['accessory'];
  },
  position: { x: number; y: number; scale: number },
  expression: ExpressionId,
  pose: PoseId,
  facing: 1 | -1,
  intensity: number,
): CharacterSpec {
  return {
    ...position,
    facing,
    ...look,
    expression,
    pose,
    phase: rng.range(0, Math.PI * 2),
    intensity,
    face: {
      eyeGap: rng.range(38, 54),
      eye: rng.range(0.86, 1.16),
      mouth: rng.range(0.85, 1.2),
      brow: rng.range(0.8, 1.3),
      blush: rng.range(0.06, 0.22),
    },
  };
}

function cameraFor(role: Shot['role'], visual: string, rng: Rng, index: number): CameraPlan {
  const fromVisual = readList<CameraMove>(
    visual,
    CAMERA_WORDS.map((row) => ({ id: row.move, words: row.words })),
    'push',
  );
  const roleDefaults: Record<Shot['role'], CameraMove[]> = {
    hook: ['punch', 'push', 'shake'],
    body: ['push', 'drift', 'tilt', 'handheld'],
    cta: ['pull', 'drift', 'pan'],
  };
  const move = hits(visual, CAMERA_WORDS.flatMap((row) => row.words)) > 0 ? fromVisual : rng.pick(roleDefaults[role]);
  return {
    move,
    intensity: 0.72 + rng.range(0, 0.55) + (role === 'hook' ? 0.2 : 0),
    direction: (index % 2 === 0 ? 1 : -1) as 1 | -1,
  };
}

function framingFor(role: Shot['role'], index: number, twoShot: boolean, rng: Rng): Framing {
  if (twoShot && role === 'hook') return 'two-shot';
  if (role === 'hook') return rng.chance(0.62) ? 'close' : 'medium';
  if (role === 'cta') return twoShot ? 'two-shot' : rng.pick<Framing>(['medium', 'wide', 'left', 'right']);
  if (index % 3 === 1) return rng.pick<Framing>(['left', 'right', 'wide']);
  if (index % 3 === 2) return 'medium';
  return rng.chance(0.3) ? 'close' : 'medium';
}

function labelOf(world: WorldId, expression: ExpressionId, pose: PoseId, mood: string): string {
  const exp = {
    tired: '지친',
    shock: '놀란',
    smile: '웃는',
    smirk: '비웃는',
    angry: '화난',
    sad: '시무룩한',
    neutral: '무표정',
    smug: '뿌듯한',
    dizzy: '혼란스러운',
  }[expression];
  const act = {
    point: '손가락으로 짚는',
    phone: '휴대폰을 보는',
    cup: '컵을 든',
    money: '지폐를 든',
    crossed: '팔짱 낀',
    palms: '두 손을 벌린',
    thumbsup: '엄지 척',
    fist: '주먹 쥔',
    'hand-on-head': '머리를 감싼',
  }[pose];
  return `${WORLD_LABEL[world]} · ${MOOD_LABEL[mood] ?? '담백한'} ${exp} 인물이 ${act} 장면`;
}

/** 컷 하나의 그림 판단에 쓰는 입력 글자. */
function sceneText(shorts: Shorts, shot: Shot): string {
  const visual = shot.visual;
  return [
    shorts.topic,
    shorts.title,
    shot.subtitle,
    visual?.scene ?? '',
    visual?.subject ?? '',
    visual?.action ?? '',
    visual?.expression ?? '',
    visual?.mood ?? '',
    ...(visual?.props ?? []),
  ]
    .filter(Boolean)
    .join(' ');
}

export function buildScenePlan(shorts: Shorts): ScenePlan {
  const seed = shorts.seed ?? `${shorts.updatedAt}`;
  const baseRng = createRng(`${seed}|${shorts.topic}|${shorts.template}|${shorts.tone}`);
  const hue = baseRng.range(-26, 26);

  // 한 영상 안에서는 같은 인물 — 표정과 동작만 컷마다 바뀝니다.
  const look = {
    hair: baseRng.pick(HAIRS),
    hairColor: baseRng.pick(HAIR_COLORS),
    skin: baseRng.pick(SKINS),
    outfit: baseRng.pick(OUTFITS),
    outfitDark: '#1e2430',
    accessory: baseRng.pick(ACCESSORIES),
  };
  look.outfitDark = shade(look.outfit, -0.35);
  const rivalLook = {
    hair: baseRng.pick(HAIRS.filter((hair) => hair !== look.hair)),
    hairColor: baseRng.pick(HAIR_COLORS),
    skin: baseRng.pick(SKINS),
    outfit: baseRng.pick(OUTFITS.filter((color) => color !== look.outfit)),
    outfitDark: '#1e2430',
    accessory: baseRng.pick(ACCESSORIES),
  };
  rivalLook.outfitDark = shade(rivalLook.outfit, -0.35);

  const templatePaletteIds = TEMPLATE_PALETTES[shorts.template];
  const themePalette = paletteOf(baseRng.pick(templatePaletteIds));

  const worldHits = WORLD_WORDS.map((row) => ({ id: row.id, score: hits(`${shorts.topic} ${shorts.title}`, row.words) })).filter(
    (row) => row.score > 0,
  );
  const pool: WorldId[] = [
    ...worldHits.sort((a, b) => b.score - a.score).map((row) => row.id),
    ...baseRng.shuffle(TEMPLATE_WORLDS[shorts.template]),
  ];
  const worlds = [...new Set(pool)].slice(0, 4);
  const twoShot = shorts.template === 'balance';

  let acc = 0;
  let previousWorld: WorldId | null = null;
  const starts: number[] = [];
  const cuts: CutScene[] = shorts.cuts.map((shot, index) => {
    starts.push(acc);
    acc += shot.duration;
    const rng = createRng(`${seed}#cut${index}#${shot.subtitle.length}`);
    const text = sceneText(shorts, shot);
    const visualText = `${shot.visual?.camera ?? ''} ${shot.visual?.mood ?? ''}`;
    const tod = todFromText(text) ?? themePalette.tod;
    let world = worlds[index % worlds.length] ?? baseRng.pick(TEMPLATE_WORLDS[shorts.template]);
    // 이모지·소품이 장소를 더 강하게 가리키면 그쪽으로.
    const propWorld: Partial<Record<PropId, WorldId>> = {
      plant: 'cozy-room',
      cat: 'cozy-room',
      food: 'cozy-room',
      laptop: 'office',
      chart: 'office',
      clock: 'office',
      heart: 'cafe',
      umbrella: 'street-rain',
      trophy: 'park-day',
    };
    const props = readProps(text, rng, 2 + (index === 0 ? 1 : 0));
    // 대본이 장소를 지정하면 그 장소를 그립니다(AI visual > 소품 힌트 > 순환).
    const declared = shot.visual?.scene ? worldForScene(shot.visual.scene) : null;
    if (declared) {
      world = declared;
    } else {
      for (const prop of props) {
        const mapped = propWorld[prop];
        if (mapped && rng.chance(0.45)) world = mapped;
      }
      if (previousWorld === world) {
        const alternatives = worlds.filter((candidate) => candidate !== world);
        world = alternatives[(index + 1) % Math.max(1, alternatives.length)] ?? world;
      }
    }
    previousWorld = world;

    const mood = shot.visual?.mood && MOOD_LABEL[shot.visual.mood] ? shot.visual.mood : pickMood(shorts.tone, rng);
    const expressionFromVisual = shot.visual?.expression
      ? readList<ExpressionId>(shot.visual.expression, EXPRESSION_WORDS, 'neutral')
      : null;
    const expression =
      (hits(text, EXPRESSION_WORDS.flatMap((row) => row.words)) > 0
        ? readList<ExpressionId>(text, EXPRESSION_WORDS, 'neutral')
        : expressionFromVisual) ?? defaultExpression(shot.role, shorts.tone, rng);
    const poseFromVisual = shot.visual?.action ? readList<PoseId>(shot.visual.action, POSE_WORDS, 'point') : null;
    const pose =
      poseFromVisual && hits(shot.visual?.action ?? '', POSE_WORDS.flatMap((row) => row.words)) > 0
        ? poseFromVisual
        : hits(text, POSE_WORDS.flatMap((row) => row.words)) > 0
          ? readList<PoseId>(text, POSE_WORDS, 'point')
          : defaultPose(shot.role, rng);

    const framing = framingFor(shot.role, index, twoShot, rng);
    const plan = framingPlan(framing, rng);
    const weather: EffectId[] = [];
    if (world === 'street-rain' || hits(text, ['비', '우산', '장마']) > 0) weather.push('rain');
    if (world === 'park-day' && rng.chance(0.6)) weather.push('petals');
    if (world === 'city-night' && rng.chance(0.6)) weather.push('snow');
    if (tod === 'night' && rng.chance(0.5)) weather.push('bokeh');

    const baseEffects: EffectId[] =
      shot.role === 'hook'
        ? ['speedlines', 'sparkle']
        : shot.role === 'cta'
          ? ['confetti', 'sparkle']
          : ['dust', 'bokeh'];
    const effects = readEffects(text, baseEffects, rng);

    const paletteBase =
      world === 'street-rain'
        ? paletteOf('rain')
        : world === 'neon-grid'
          ? paletteOf('neon')
          : world === 'cozy-room' || world === 'office' || world === 'cafe'
            ? paletteOf(index % 2 === 0 ? 'indoor-warm' : 'indoor-cool')
            : world === 'city-night' || world === 'subway'
              ? paletteOf('midnight')
              : paletteOf(tod === 'day' ? 'morning' : tod === 'night' ? 'midnight' : 'golden');
    const palette = variantPalette(paletteBase, hue, index);
    const visualAccent = shot.visual?.palette?.find((color) => /^#[0-9a-f]{6}$/i.test(color));
    if (visualAccent) palette.accent = visualAccent;

    return {
      index,
      world,
      timeOfDay: tod,
      palette,
      framing,
      camera: cameraFor(shot.role, visualText, rng, index),
      hero: makeCharacter(rng, look, plan.hero, expression, pose, plan.rival ? 1 : (rng.chance(0.5) ? 1 : -1), 0.85 + rng.range(0, 0.4)),
      rival: plan.rival ? makeCharacter(rng, rivalLook, plan.rival, 'smirk', 'crossed', -1, 1) : undefined,
      props,
      effects,
      weather,
      label: labelOf(world, expression, pose, mood),
      light: 0.55 + rng.range(0, 0.45),
    };
  });

  return {
    seed,
    cuts,
    shots: shorts.cuts,
    starts,
    total: acc,
    banner: shorts.banner,
    accent: cuts[0]?.palette.accent ?? themePalette.accent,
    template: shorts.template,
    tone: shorts.tone,
  };
}

function pickMood(tone: Tone, rng: Rng): string {
  const toneMoods: Record<Tone, string[]> = {
    cider: ['tense', 'hype', 'bright', 'cold'],
    empathy: ['warm', 'dreamy', 'gloomy', 'bright'],
    humor: ['comic', 'hype', 'bright', 'tense'],
  };
  return rng.pick(toneMoods[tone]);
}

function defaultExpression(role: Shot['role'], tone: Tone, rng: Rng): ExpressionId {
  if (role === 'hook') return rng.pick<ExpressionId>(tone === 'humor' ? ['dizzy', 'shock', 'sad'] : ['shock', 'angry', 'neutral']);
  if (role === 'cta') return rng.pick<ExpressionId>(['smile', 'smug', 'smirk']);
  return rng.pick<ExpressionId>(['neutral', 'tired', 'smirk', 'dizzy']);
}

function defaultPose(role: Shot['role'], rng: Rng): PoseId {
  if (role === 'hook') return rng.pick<PoseId>(['point', 'palms', 'fist', 'hand-on-head']);
  if (role === 'cta') return rng.pick<PoseId>(['thumbsup', 'palms', 'fist', 'point']);
  return rng.pick<PoseId>(['point', 'cup', 'phone', 'crossed', 'palms']);
}

/** 컷 카드·가이드에 보여 줄 한 줄 장면 설명 */
export function cutSceneLabel(plan: ScenePlan, index: number): string {
  return plan.cuts[index]?.label ?? '';
}

export { PALETTES, WORLD_LABEL };
