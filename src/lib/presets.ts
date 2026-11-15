import type { AiVoiceStyle, BgmMood, Cut, CutCamera, CutRole, Project, Theme, ThemeId } from '../types';


/** public/presets 아래 장면 이미지 경로를 배포 base 경로에 맞춰 만듭니다. */
const presetImage = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, '')}`;

export const THEMES: Theme[] = [
  { id: 'sunset', name: '선셋', from: '#ff6b6b', to: '#7c3aed', accent: '#fde047', text: '#ffffff' },
  { id: 'night', name: '미드나잇', from: '#0f172a', to: '#334155', accent: '#38bdf8', text: '#ffffff' },
  { id: 'mint', name: '민트', from: '#06b6d4', to: '#065f46', accent: '#bbf7d0', text: '#ffffff' },
  { id: 'candy', name: '캔디', from: '#f472b6', to: '#8b5cf6', accent: '#fef08a', text: '#ffffff' },
  { id: 'mono', name: '먹색', from: '#111827', to: '#4b5563', accent: '#f59e0b', text: '#ffffff' },
];

export const THEME_MAP: Record<ThemeId, Theme> = THEMES.reduce(
  (acc, t) => {
    acc[t.id] = t;
    return acc;
  },
  {} as Record<ThemeId, Theme>,
);

export const BGM_MOODS: { id: BgmMood; label: string; hint: string }[] = [
  { id: 'playful', label: '발랄', hint: '통통 튀는 플럭 · 밸런스게임 기본' },
  { id: 'upbeat', label: '신남', hint: '빠른 비트 · 밈형' },
  { id: 'calm', label: '잔잔', hint: '차분한 패드 · 사연형' },
  { id: 'tense', label: '긴장', hint: '불안한 저음 · 반전형' },
  { id: 'none', label: '무음', hint: 'BGM 없이 목소리만' },
];

/** 컷별 카메라 무빙 — 같은 그림을 두 컷에 써도 다른 화면처럼 보이게 합니다. */
export const CAMERA_OPTIONS: { id: CutCamera; label: string; hint: string }[] = [
  { id: 'auto', label: '자동', hint: '컷 순서에 맞춰 알아서 움직입니다' },
  { id: 'push', label: '푸시', hint: '천천히 밀고 들어감' },
  { id: 'pull', label: '풀', hint: '클로즈업에서 넓게 빠짐' },
  { id: 'punch', label: '펀치', hint: '타이트한 클로즈업 (같은 그림의 다른 구도)' },
  { id: 'drift', label: '드리프트', hint: '가로로 흐르는 클로즈업' },
];

export interface DraftTemplate {
  id: string;
  label: string;
  emoji: string;
  topic: string;
  theme: ThemeId;
  bgm: BgmMood;
  /** 영상 상단에 고정으로 박히는 주제 배너 */
  banner: string;
  /** 훅 · A · B · 투표 컷에 쓸 장면 이미지 (public 기준 경로). 없으면 테마 그라디언트로 그립니다. */
  scenes?: [string, string, string, string];
  thumbnails: string[];
  hooks: string[];
  a: { label: string; line: string; details: string[] };
  b: { label: string; line: string; details: string[] };
  cta: string[];
}

/**
 * 전부 가상의 사무실 밸런스 게임입니다.
 * 실존 인물·회사·실제 사건과 무관하며, 광고·저작권 걱정 없이 쓰는 소재로만 채웠습니다.
 *
 * 문장은 "한 컷에 한 마디"가 되도록 짧게 씁니다.
 * +18% 속도로 읽었을 때 2.5~3.2초에 들어가는 길이가 기준입니다.
 */
export const TEMPLATES: DraftTemplate[] = [
  {
    id: 'overtime',
    label: '월급 1.5배 vs 칼퇴',
    emoji: '💸',
    topic: '월급 1.5배 매일 야근 vs 칼퇴 월급 동결',
    theme: 'sunset',
    bgm: 'playful',
    banner: '직장인 밸런스 게임',
    scenes: [
      presetImage('/presets/balance-1/hook.jpg'),
      presetImage('/presets/balance-1/choice-a.jpg'),
      presetImage('/presets/balance-1/choice-b.jpg'),
      presetImage('/presets/balance-1/cta.jpg'),
    ],
    thumbnails: ['월급 1.5배 vs 칼퇴', '이거 고르면 회사생활 끝', '당신의 선택은?'],
    hooks: [
      '직장인 *최악의 지옥*, 하나만 고른다?',
      '솔직히 *최악*, 하나만 고른다면?',
      '*월급*이냐 *칼퇴*냐, 더 못 견디는 쪽은?',
    ],
    a: {
      label: '월급 1.5배',
      line: '월급 *1.5배*에 밤 9시 야근',
      details: [
        '주말 *단톡방*, 연차엔 "어디 아파?"',
        '연차 쓰면 *"어디 아파?"* 눈치까지',
      ],
    },
    b: {
      label: '칼퇴 보장',
      line: '*칼퇴* 보장, 월급은 *3년째* 동결',
      details: [
        '점심마다 팀장이 "*무슨 일 있어?*"',
        '커피 마시는데 팀장이 "*바쁘지?*"',
      ],
    },
    cta: ['둘 다 *퇴사각*. 댓글로 골라줘', '*1번*이야 *2번*이야? 댓글로'],
  },
  {
    id: 'dinner',
    label: '회식 3차 vs 2차 귀가',
    emoji: '🍻',
    topic: '회식 3차까지 vs 2차에서 귀가',
    theme: 'night',
    bgm: 'upbeat',
    banner: '직장인 밸런스 게임',
    thumbnails: ['회식 3차 vs 2차 귀가', '이 선택이 야근을 부른다', '직장인 필수 시험'],
    hooks: [
      '*회식* 하나로 평판이 갈립니다',
      '3차 가면 *다음 날*이 문제입니다',
      '*회식* 몇 차까지가 안전할까?',
    ],
    a: {
      label: '3차까지',
      line: '3차까지, 새벽 1시 귀가',
      details: ['다음 날 얼굴은 *시체*, 대신 팀장 1등', '대신 팀장 마음속 *1등*은 확보'],
    },
    b: {
      label: '2차 귀가',
      line: '2차에 *자연스럽게* 이탈',
      details: ['다음 날 *컨디션 최상*, 평판은 미지수', '대신 *평판*은 미지수입니다'],
    },
    cta: ['*3차*? *귀가*? 댓글로', '당신은 *몇 차*까지? 댓글로'],
  },
  {
    id: 'remote',
    label: '평생 재택 vs 연봉 20%',
    emoji: '🏠',
    topic: '평생 재택근무 vs 출근 4일 + 연봉 20% 인상',
    theme: 'mint',
    bgm: 'playful',
    banner: '직장인 밸런스 게임',
    thumbnails: ['평생 재택 vs 연봉 20%', '이건 진짜 어렵다', '출근 vs 재택'],
    hooks: [
      '재택이 *좋은 줄* 알았는데',
      '연봉 20%면 *출근*하시겠습니까?',
      '이 선택, *3년 뒤* 후회합니다',
    ],
    a: {
      label: '평생 재택',
      line: '평생 재택, 출근 0분',
      details: ['대신 모든 회의는 *화상* 속에서', '*눈치*도 0분, 대신 전부 화상'],
    },
    b: {
      label: '출근 4일 · 연봉 20%↑',
      line: '연봉 *20%* 인상, 대신 출근 4일',
      details: ['왕복 2시간이 *진짜 월급*', '월급은 오르는데 *하루*가 사라짐'],
    },
    cta: ['*재택*? *출근*? 댓글로', '당신의 선택은? *댓글*로'],
  },
  {
    id: 'lunch',
    label: '점심 2시간 vs 칼퇴 30분',
    emoji: '🍜',
    topic: '점심시간 2시간 vs 칼퇴 30분 당기기',
    theme: 'candy',
    bgm: 'playful',
    banner: '직장인 밸런스 게임',
    thumbnails: ['점심 2시간 vs 칼퇴 30분', '점심시간의 진실', '이거 고르면 하루가 달라짐'],
    hooks: [
      '점심 *2시간*, 진짜 좋을까?',
      '*점심시간*이 하루를 바꿉니다',
      '이거 고르면 *오후*가 사라집니다',
    ],
    a: {
      label: '점심 2시간',
      line: '점심 2시간, *산책*까지 가능',
      details: ['오후 업무는 *밀린 채로* 시작', '대신 오후는 *밀린 채로* 시작'],
    },
    b: {
      label: '칼퇴 30분',
      line: '5시 30분 퇴근, 대신 점심 10분',
      details: ['그 30분이 *진짜 인생*', '점심은 *김밥*으로 10분컷'],
    },
    cta: ['*2시간*? *30분*? 댓글로', '댓글로 *투표* 부탁드립니다'],
  },
];

export function cutRoleLabel(role: CutRole): string {
  if (role === 'hook') return '훅';
  if (role === 'cta') return '투표';
  return '본문';
}

/** 컷별 기본 카메라 — 같은 그림을 두 번 쓰는 자리를 다르게 보이게 합니다. */
function defaultCamera(index: number, total: number): CutCamera {
  if (index === 0) return 'push';
  if (index === total - 1) return 'pull';
  if (index % 2 === 1) return 'push';
  return 'drift';
}

let seq = 0;
function newId(): string {
  seq += 1;
  return `cut-${Date.now().toString(36)}-${seq}`;
}

export function stripMarks(text: string): string {
  return text.replace(/\*/g, '');
}

function pick<T>(arr: T[], prev?: T): T {
  if (arr.length === 0) throw new Error('empty list');
  if (arr.length === 1) return arr[0] as T;
  let next = arr[Math.floor(Math.random() * arr.length)] as T;
  let guard = 0;
  while (prev !== undefined && next === prev && guard < 8) {
    next = arr[Math.floor(Math.random() * arr.length)] as T;
    guard += 1;
  }
  return next;
}

function makeCut(partial: Partial<Cut> & { role: CutRole }): Cut {
  return {
    id: newId(),
    headline: '',
    subtitle: '',
    narration: '',
    duration: 3,
    theme: 'sunset',
    image: null,
    audio: null,
    camera: 'auto',
    ...partial,
  };
}

/** MP4에 들어가는 AI 목소리 후보 (edge-tts 한국어 신경망 음성) */
export const AI_VOICES: { id: string; label: string; hint: string }[] = [
  { id: 'ko-KR-SunHiNeural', label: '선희 · 여성', hint: '빠르고 밝은 2030 쇼츠 톤' },
  { id: 'ko-KR-InJoonNeural', label: '인준 · 남성', hint: '낮고 안정적인 정보형 톤' },
  { id: 'ko-KR-HyunsuMultilingualNeural', label: '현수 · 남성', hint: '밝고 발랄한 예능형 톤' },
];

/** 쇼츠는 살짝 빠르고 조금 높은 목소리가 힙합니다. (2배속 세대의 기본값) */
export const DEFAULT_AI_VOICE: AiVoiceStyle = {
  engine: 'edge',
  voice: 'ko-KR-SunHiNeural',
  voiceLabel: '선희 · 여성',
  ratePct: 18,
  pitchHz: 5,
};

/**
 * 6컷 구성 — 훅 → A → A 디테일 → B → B 디테일 → 투표.
 * 컷마다 2.6~3.2초. 목소리가 길면 렌더 단계에서 그 컷만 늘어납니다.
 */
const CUT_PLAN: { duration: number; camera: CutCamera }[] = [
  { duration: 3.0, camera: 'push' },
  { duration: 3.2, camera: 'push' },
  { duration: 2.95, camera: 'punch' },
  { duration: 3.25, camera: 'push' },
  { duration: 2.6, camera: 'drift' },
  { duration: 2.8, camera: 'pull' },
];

function sceneAsset(path: string | undefined) {
  if (!path) return null;
  const name = path.split('/').pop() ?? 'scene.jpg';
  return { name, dataUrl: path };
}

/** 밸런스 게임 한 편(훅 + A 2컷 + B 2컷 + 투표)을 만들어 냅니다. */
export function buildDraft(template: DraftTemplate): Cut[] {
  const hook = pick(template.hooks);
  const aDetail = pick(template.a.details);
  const bDetail = pick(template.b.details);
  const cta = pick(template.cta);
  const thumb = pick(template.thumbnails);
  const scenes = template.scenes ?? [];

  const beats: { role: CutRole; headline: string; line: string; scene: number }[] = [
    { role: 'hook', headline: thumb, line: hook, scene: 0 },
    { role: 'body', headline: `1번 · ${template.a.label}`, line: template.a.line, scene: 1 },
    { role: 'body', headline: '1번의 진짜 함정', line: aDetail, scene: 1 },
    { role: 'body', headline: `2번 · ${template.b.label}`, line: template.b.line, scene: 2 },
    { role: 'body', headline: '2번의 진짜 함정', line: bDetail, scene: 2 },
    { role: 'cta', headline: '댓글 안 달면 부장님 옆자리', line: cta, scene: 3 },
  ];

  return beats.map((beat, index) => {
    const plan = CUT_PLAN[index] ?? { duration: 3, camera: 'auto' as CutCamera };
    return makeCut({
      role: beat.role,
      headline: beat.headline,
      subtitle: beat.line,
      narration: stripMarks(beat.line),
      duration: plan.duration,
      theme: template.theme,
      image: sceneAsset(scenes[beat.scene]),
      camera: plan.camera,
    });
  });
}

/** 직접 입력한 주제로도 같은 6컷 구조의 초안을 만듭니다. 'vs'로 A/B를 나눕니다. */
export function buildDraftFromTopic(topic: string, theme: ThemeId): Cut[] {
  const cleaned = topic.trim();
  const parts = cleaned.split(/\s*(?:vs\.?|VS\.?|대\s|아니면)\s*/).filter(Boolean);
  const aText = parts[0]?.trim() || cleaned || '선택지 A';
  const bText = parts[1]?.trim() || '선택지 B';
  const headline = `${aText} vs ${bText}`;

  const beats: { role: CutRole; headline: string; subtitle: string; narration: string }[] = [
    {
      role: 'hook',
      headline,
      subtitle: `*${aText}* 아니면 *${bText}*, 하나만 고른다면?`,
      narration: `${aText}, 아니면 ${bText}. 하나만 고른다면?`,
    },
    {
      role: 'body',
      headline: `1번 · ${aText}`,
      subtitle: `${aText}, *얻는 것*이 있습니다`,
      narration: `${aText}. 얻는 것이 있습니다.`,
    },
    {
      role: 'body',
      headline: '1번의 진짜 함정',
      subtitle: `대신 *잃는 것*도 있습니다`,
      narration: '대신 잃는 것도 있습니다.',
    },
    {
      role: 'body',
      headline: `2번 · ${bText}`,
      subtitle: `${bText}, *하루의 모양*이 바뀝니다`,
      narration: `${bText}. 하루의 모양이 바뀝니다.`,
    },
    {
      role: 'body',
      headline: '2번의 진짜 함정',
      subtitle: `그런데 *이게* 걸립니다`,
      narration: '그런데 이게 걸립니다.',
    },
    {
      role: 'cta',
      headline: '댓글 안 달면 부장님 옆자리',
      subtitle: `1번? 2번? *댓글*로 골라줘`,
      narration: '1번, 아니면 2번. 댓글로 골라줘.',
    },
  ];

  return beats.map((beat, index) => {
    const plan = CUT_PLAN[index] ?? { duration: 3, camera: 'auto' as CutCamera };
    return makeCut({
      ...beat,
      duration: plan.duration,
      theme,
      camera: plan.camera,
    });
  });
}

export function draftToProject(template: DraftTemplate | null, topic: string): Project {
  const theme: ThemeId = template?.theme ?? 'sunset';
  const bgm: BgmMood = template?.bgm ?? 'playful';
  const cuts = template ? buildDraft(template) : buildDraftFromTopic(topic, theme);
  return {
    id: `proj-${Date.now().toString(36)}`,
    title: template?.label ?? (topic.trim() || '새 쇼츠'),
    topic: template?.topic ?? topic,
    cuts,
    subtitle: { position: 'bottom', sizePx: 66, color: '#ffffff', highlight: '#fde047', outline: 3 },
    headline: { enabled: true, sizePx: 74 },
    banner: { enabled: true, text: template?.banner ?? '직장인 밸런스 게임' },
    voice: { voiceURI: '', voiceName: '', lang: 'ko-KR', rate: 1.18, pitch: 1.05, volume: 1 },
    aiVoice: DEFAULT_AI_VOICE,
    bgm: { mood: bgm, volume: 0.22 },
    updatedAt: Date.now(),
  };
}

export { defaultCamera };
