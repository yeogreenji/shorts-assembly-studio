import type { BrandSettings, CaptionStyle, Shorts, Shot, ShotImage, TemplateId, Tone } from '../../types';
import { createRng, type Rng } from './rng';
import { type ArtDef, type ArtExpression, type ArtShot, expressionFromWords, inferTopicGenre, pickArt } from './art';
import { brandOf, styleOf } from '../defaults';

/**
 * 대본 → 그림. 컷마다 웹툰·로판 일러스트 한 장을 고르고,
 * 카메라 무빙·공기(비/꽃잎)·빛·자막을 얹어 "AI 영상처럼 움직이는 컷"을 조립합니다.
 */

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
  | 'bolt'
  | 'light'
  | 'shards';

export type CameraMove =
  | 'push'
  | 'pull'
  | 'punch'
  | 'whip'
  | 'drift'
  | 'tilt'
  | 'shake'
  | 'handheld'
  | 'orbit'
  | 'slide';

/** 자막·UI가 쓰는 색 묶음 — 일러스트의 대표색에서 뽑습니다. */
export interface ScenePalette {
  accent: string;
  glow: string;
  ink: string;
  top: string;
  mid: string;
  bottom: string;
}

export interface CameraPlan {
  move: CameraMove;
  intensity: number;
  /** 패닝/드리프트 방향 */
  direction: 1 | -1;
}

export interface CutScene {
  index: number;
  /** 이 컷에 쓰이는 웹툰/로판 일러스트 (내 이미지를 올렸으면 그것) */
  art: ArtDef;
  framing: ArtShot;
  camera: CameraPlan;
  palette: ScenePalette;
  /** 그림 위에 얹는 공기·파티클 */
  effects: EffectId[];
  /** 앞뒤로 흐르는 날씨(비·눈·꽃잎) */
  weather: EffectId[];
  /** 이 컷이 무엇을 그리는지 한 줄 (화면·가이드에 표시) */
  label: string;
  /** 컷마다 다른 조명 세기 */
  light: number;
  /** 사용자가 올린 내 이미지로 그리는 컷 */
  custom: boolean;
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
  /** 자막 테마·위치·크기 — 미리보기와 영상이 같은 값을 씁니다 */
  style: CaptionStyle;
  /** 브랜드 워터마크 */
  brand: BrandSettings;
}

const SHOT_LABEL: Record<ArtShot, string> = {
  close: '클로즈업',
  medium: '인물 중심',
  wide: '와이드',
  'two-shot': '두 사람',
};

const CAMERA_WORDS: { move: CameraMove; words: string[] }[] = [
  { move: 'push', words: ['push', '줌인', 'zoom in', '다가', '클로즈'] },
  { move: 'pull', words: ['pull', '줌아웃', 'zoom out', '멀어', '와이드'] },
  { move: 'punch', words: ['punch', '펀치', '강조', '때리', '훅'] },
  { move: 'whip', words: ['whip', '휩', '확', '빠르게', '휙'] },
  { move: 'drift', words: ['pan-left', 'pan-right', '패닝', '옆으로', '흐르'] },
  { move: 'tilt', words: ['tilt', '틸트', '위로', '아래로'] },
  { move: 'shake', words: ['shake', '흔들', '충격', '진동'] },
  { move: 'handheld', words: ['handheld', '핸드헬드', '들고', '현장'] },
  { move: 'orbit', words: ['orbit', '회전', '돌리', '한 바퀴'] },
  { move: 'slide', words: ['slide', '슬라이드', '지나가', '훑'] },
];

const ROLE_CAMERAS: Record<Shot['role'], CameraMove[]> = {
  hook: ['punch', 'whip', 'slide', 'shake', 'push'],
  body: ['push', 'drift', 'tilt', 'handheld', 'orbit', 'whip'],
  cta: ['pull', 'orbit', 'push', 'drift'],
};

const ROLE_EFFECTS: Record<Shot['role'], EffectId[]> = {
  hook: ['speedlines', 'sparkle'],
  body: ['dust', 'bokeh'],
  cta: ['confetti', 'sparkle'],
};

const EFFECT_WORDS: { id: EffectId; words: string[] }[] = [
  { id: 'money', words: ['돈', '월급', '연봉', '지폐', '월세', '비싸', '보너스'] },
  { id: 'heart', words: ['연애', '썸', '고백', '마음', '좋아', '설렘'] },
  { id: 'bolt', words: ['사이다', '팩트', '한방', '결론', '경고'] },
  { id: 'sparkle', words: ['팁', '꿀팁', '추천', '성공', '최고'] },
  { id: 'petals', words: ['봄', '벚꽃', '정원', '꽃'] },
  { id: 'steam', words: ['커피', '라테', '요리', '야식', '따뜻'] },
  { id: 'shards', words: ['반전', '충격', '유리', '깨'] },
];

function hits(text: string, words: string[]): number {
  const haystack = text.toLowerCase();
  return words.reduce((count, word) => (word && haystack.includes(word.toLowerCase()) ? count + 1 : count), 0);
}

function cameraFor(role: Shot['role'], visualCamera: string, rng: Rng, index: number): CameraPlan {
  let move: CameraMove | null = null;
  let best = 0;
  for (const row of CAMERA_WORDS) {
    const score = hits(visualCamera, row.words);
    if (score > best) {
      best = score;
      move = row.move;
    }
  }
  const chosen = move ?? rng.pick(ROLE_CAMERAS[role]);
  return {
    move: chosen,
    // 컷마다 움직임의 세기를 다르게 — 같은 무빙이 반복되지 않게.
    intensity: 0.82 + rng.range(0, 0.55) + (role === 'hook' ? 0.22 : 0),
    direction: (index % 2 === 0 ? 1 : -1) as 1 | -1,
  };
}

function shadeHex(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  const r = clamp(((num >> 16) & 255) * (1 + amount));
  const g = clamp(((num >> 8) & 255) * (1 + amount));
  const b = clamp((num & 255) * (1 + amount));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function paletteOf(art: ArtDef): ScenePalette {
  return {
    accent: art.accent,
    glow: shadeHex(art.accent, 0.18),
    ink: shadeHex(art.tones.mid, -0.62),
    top: art.tones.top,
    mid: art.tones.mid,
    bottom: art.tones.bottom,
  };
}

/** 컷의 그림을 고르는 데 쓰는 좁은 문맥 — 장소·소품·동작. */
function sceneText(shot: Shot): string {
  const visual = shot.visual;
  return [visual?.scene ?? '', visual?.subject ?? '', visual?.action ?? '', ...(visual?.props ?? [])]
    .filter(Boolean)
    .join(' ');
}

/** 넓은 문맥 — 주제·제목·자막까지. */
function bodyText(shorts: Shorts, shot: Shot): string {
  const visual = shot.visual;
  return [
    shorts.topic,
    shorts.title,
    shot.subtitle.replace(/\*/g, ''),
    visual?.expression ?? '',
    visual?.mood ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

function expressionFor(shot: Shot, shorts: Shorts): ArtExpression | null {
  const visual = shot.visual;
  return (
    (visual?.expression ? expressionFromWords(visual.expression) : null) ??
    expressionFromWords(shot.subtitle.replace(/\*/g, '')) ??
    expressionFromWords(shorts.topic)
  );
}

function mergeEffects(base: EffectId[], extra: EffectId[], limit: number): EffectId[] {
  return [...new Set([...extra, ...base])].slice(0, limit);
}

/**
 * 내 이미지는 일러스트와 같은 창고(artLoader)에 `img:` 접두사로 들어 있습니다.
 * 장면 메타데이터(카메라·색·효과)는 원래 배정된 일러스트의 결을 그대로 이어받습니다.
 */
function customArtOf(base: ArtDef, image: ShotImage): ArtDef {
  return {
    ...base,
    id: `img:${image.id}`,
    file: '',
    title: image.name || '내 이미지',
    expression: 'neutral',
    focus: { x: 0.5, y: 0.44 },
    tags: [],
    light: Math.max(0.75, base.light * 0.92),
  };
}

export function buildScenePlan(shorts: Shorts): ScenePlan {
  const seed = shorts.seed ?? `${shorts.updatedAt}`;
  const usedIds = new Set<string>();
  let previous: ArtDef | undefined;
  let acc = 0;
  const starts: number[] = [];
  // 같은 이펙트가 모든 컷에 깔리지 않도록 컷마다 쓸 수 있는 횟수를 정해 둡니다.
  const effectBudget = new Map<EffectId, number>();
  const versus = shorts.template === 'balance';
  const genreLock = inferTopicGenre(`${shorts.topic} ${shorts.title}`);

  const cuts: CutScene[] = shorts.cuts.map((shot, index) => {
    starts.push(acc);
    acc += shot.duration;
    const rng = createRng(`${seed}#cut${index}#${shot.subtitle.length}#${shorts.tone}`);
    const scene = sceneText(shot);
    const body = bodyText(shorts, shot);
    const expression = expressionFor(shot, shorts);
    const visualCamera = `${shot.visual?.camera ?? ''} ${shot.visual?.mood ?? ''}`;

    const picked = pickArt({
      scene,
      body,
      expression,
      role: shot.role,
      template: shorts.template,
      tone: shorts.tone,
      rng,
      usedIds,
      previous,
      versus: versus && (shot.role === 'hook' || shot.role === 'cta' || index === 3),
      genreLock,
    });
    usedIds.add(picked.id);
    previous = picked;

    // 이 컷에 내 이미지를 올렸으면 그림만 바꿔 끼웁니다(카메라·색·효과는 그대로).
    const custom = Boolean(shot.image);
    const art = shot.image ? customArtOf(picked, shot.image) : picked;

    const weather: EffectId[] = [...art.weather];
    if (hits(`${scene} ${body}`, ['비', '우산', '장마']) > 0 && !weather.includes('rain')) weather.push('rain');
    if (hits(`${scene} ${body}`, ['눈', '겨울']) > 0 && !weather.includes('snow')) weather.push('snow');
    if (hits(`${scene} ${body}`, ['벚꽃', '봄', '꽃잎']) > 0 && !weather.includes('petals')) weather.push('petals');
    if (art.genre === 'royal' && rng.chance(0.5) && !weather.includes('petals')) weather.push('petals');
    if (art.genre === 'night' && rng.chance(0.6)) weather.push('bokeh');

    // 효과는 그 컷의 자막에서만, 그것도 영상 전체에서 몇 번만 — 주제 단어가 모든 컷에 깔리지 않게.
    const cutWords = shot.subtitle.replace(/\*/g, '');
    const keywordEffects: EffectId[] = [];
    for (const row of EFFECT_WORDS) {
      if (hits(cutWords, row.words) === 0) continue;
      const limit = row.id === 'money' || row.id === 'heart' ? 2 : 1;
      const used = effectBudget.get(row.id) ?? 0;
      if (used >= limit) continue;
      effectBudget.set(row.id, used + 1);
      keywordEffects.push(row.id);
    }
    const effects = mergeEffects(art.effects, [...keywordEffects, ...ROLE_EFFECTS[shot.role]], 4);

    return {
      index,
      art,
      framing: art.shot,
      camera: cameraFor(shot.role, visualCamera, rng, index),
      palette: paletteOf(art),
      effects,
      weather: [...new Set(weather)].slice(0, 2),
      label: `${art.title} · ${SHOT_LABEL[art.shot]}`,
      light: Math.min(1.15, art.light * (0.86 + rng.range(0, 0.3))),
      custom,
    };
  });

  return {
    seed,
    cuts,
    shots: shorts.cuts,
    starts,
    total: acc,
    banner: shorts.banner,
    accent: cuts[0]?.palette.accent ?? '#ffd6f2',
    template: shorts.template,
    tone: shorts.tone,
    style: styleOf(shorts),
    brand: brandOf(shorts),
  };
}

/** 컷 카드·가이드에 보여 줄 한 줄 장면 설명 */
export function cutSceneLabel(plan: ScenePlan, index: number): string {
  return plan.cuts[index]?.label ?? '';
}
