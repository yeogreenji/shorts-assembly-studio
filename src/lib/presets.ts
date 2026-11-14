import type { BgmMood, Cut, CutRole, Project, Theme, ThemeId } from '../types';

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
  { id: 'calm', label: '잔잔', hint: '차분한 패드 · 사연형' },
  { id: 'upbeat', label: '신남', hint: '빠른 비트 · 밈형' },
  { id: 'playful', label: '발랄', hint: '통통 튀는 플럭 · 밸런스게임' },
  { id: 'tense', label: '긴장', hint: '불안한 저음 · 반전형' },
  { id: 'none', label: '무음', hint: 'BGM 없이 목소리만' },
];

export interface DraftTemplate {
  id: string;
  label: string;
  emoji: string;
  topic: string;
  theme: ThemeId;
  bgm: BgmMood;
  thumbnails: string[];
  hooks: string[];
  a: { label: string; lines: string[] };
  b: { label: string; lines: string[] };
  cta: string[];
}

/**
 * 전부 가상의 사무실 밸런스 게임입니다.
 * 실존 인물·회사·실제 사건과 무관하며, 광고·저작권 걱정 없이 쓰는 소재로만 채웠습니다.
 */
export const TEMPLATES: DraftTemplate[] = [
  {
    id: 'overtime',
    label: '월급 1.5배 vs 칼퇴',
    emoji: '💸',
    topic: '월급 1.5배 매일 야근 vs 칼퇴 월급 동결',
    theme: 'sunset',
    bgm: 'playful',
    thumbnails: ['월급 1.5배 vs 칼퇴', '이거 고르면 회사생활 끝', '당신의 선택은?'],
    hooks: [
      '이거 하나로 *회사생활* 갈립니다',
      '솔직히 *월급 1.5배*면 하시겠죠?',
      '지금 이거 고민하는 사람 *분명* 있습니다',
    ],
    a: {
      label: '월급 1.5배 · 매일 야근',
      lines: [
        '월급은 *1.5배*. 대신 매일 밤 11시 퇴근입니다',
        '연차는 *눈치*, 주말 출근은 기본 옵션',
      ],
    },
    b: {
      label: '칼퇴 · 월급 동결',
      lines: [
        '6시 정각 *칼퇴*. 월급은 3년째 그대로',
        '대신 퇴근 후 *내 시간*이 진짜 월급입니다',
      ],
    },
    cta: ['댓글에 *A* 아니면 *B* 남겨주세요', '당신은 어느 쪽? *댓글*로 투표'],
  },
  {
    id: 'dinner',
    label: '회식 3차 vs 2차 귀가',
    emoji: '🍻',
    topic: '회식 3차까지 vs 2차에서 귀가',
    theme: 'night',
    bgm: 'upbeat',
    thumbnails: ['회식 3차 vs 2차 귀가', '이 선택이 야근을 부른다', '직장인 필수 시험'],
    hooks: [
      '*회식* 하나로 평판이 갈립니다',
      '3차 가면 *다음 날*이 문제입니다',
      '이거 못 고르면 *사회생활* 힘듭니다',
    ],
    a: {
      label: '3차까지 · 팀의 중심',
      lines: [
        '새벽 1시까지 *3차*. 다음 날 얼굴은 시체',
        '대신 팀장 마음 속 *1등*은 확보'],
    },
    b: {
      label: '2차 귀가 · 내 침대',
      lines: [
        '2차에서 *자연스럽게* 이탈 선언',
        '다음 날 *컨디션 최상*, 평판은 미지수'],
    },
    cta: ['당신은 *몇 차*까지 가시나요?', '댓글에 *3차* 아니면 *귀가*'],
  },
  {
    id: 'remote',
    label: '평생 재택 vs 연봉 20%',
    emoji: '🏠',
    topic: '평생 재택근무 vs 출근 4일 + 연봉 20% 인상',
    theme: 'mint',
    bgm: 'calm',
    thumbnails: ['평생 재택 vs 연봉 20%', '이건 진짜 어렵다', '출근 vs 재택'],
    hooks: [
      '재택이 *좋은 줄* 알았는데',
      '연봉 20%면 *출근*하시겠습니까?',
      '이 선택, *3년 뒤* 후회합니다',
    ],
    a: {
      label: '평생 재택',
      lines: ['출근 0분. *눈치*도 0분', '대신 모든 회의는 *화면* 속에서'],
    },
    b: {
      label: '출근 4일 · 연봉 20%↑',
      lines: ['월급이 *20%* 올라갑니다', '대신 왕복 2시간, *그게 진짜 월급*'],
    },
    cta: ['댓글에 *재택* 아니면 *출근*', '당신의 선택은? *댓글*로'],
  },
  {
    id: 'lunch',
    label: '점심 2시간 vs 칼퇴 30분',
    emoji: '🍜',
    topic: '점심시간 2시간 vs 칼퇴 30분 당기기',
    theme: 'candy',
    bgm: 'playful',
    thumbnails: ['점심 2시간 vs 칼퇴 30분', '점심시간의 진실', '이거 고르면 하루가 달라짐'],
    hooks: [
      '점심시간 *2시간*이면 뭐 하시겠어요?',
      '하루의 *질*이 바뀌는 선택',
      '이거 고르면 *오후*가 사라집니다',
    ],
    a: {
      label: '점심 2시간',
      lines: ['밥 먹고 *산책*까지 가능', '대신 오후 업무는 *밀린 채로* 시작'],
    },
    b: {
      label: '칼퇴 30분 당기기',
      lines: ['5시 30분에 *퇴근*. 그 30분이 인생', '점심은 *10분*컷, 김밥과 함께'],
    },
    cta: ['점심 *2시간*? 칼퇴 *30분*?', '댓글로 *투표* 부탁드립니다'],
  },
];

export function cutRoleLabel(role: CutRole): string {
  if (role === 'hook') return '훅';
  if (role === 'cta') return '투표';
  return '본문';
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
    duration: 4,
    theme: 'sunset',
    image: null,
    audio: null,
    ...partial,
  };
}

/** 밸런스 게임 한 편(훅 3초 + A/B 2컷 + 투표 1컷)을 만들어 냅니다. */
export function buildDraft(template: DraftTemplate): Cut[] {
  const hook = pick(template.hooks);
  const aLine = pick(template.a.lines);
  const bLine = pick(template.b.lines);
  const cta = pick(template.cta);
  const thumb = pick(template.thumbnails);

  return [
    makeCut({
      role: 'hook',
      headline: thumb,
      subtitle: hook,
      narration: stripMarks(hook),
      duration: 3,
      theme: template.theme,
    }),
    makeCut({
      role: 'body',
      headline: `A. ${template.a.label}`,
      subtitle: aLine,
      narration: stripMarks(aLine),
      duration: 5,
      theme: template.theme,
    }),
    makeCut({
      role: 'body',
      headline: `B. ${template.b.label}`,
      subtitle: bLine,
      narration: stripMarks(bLine),
      duration: 5,
      theme: template.theme,
    }),
    makeCut({
      role: 'cta',
      headline: '당신의 선택은?',
      subtitle: cta,
      narration: stripMarks(cta),
      duration: 4,
      theme: template.theme,
    }),
  ];
}

/** 직접 입력한 주제로도 같은 구조의 초안을 만듭니다. 'vs'로 A/B를 나눕니다. */
export function buildDraftFromTopic(topic: string, theme: ThemeId): Cut[] {
  const cleaned = topic.trim();
  const parts = cleaned.split(/\s*(?:vs\.?|VS\.?|대\s|아니면)\s*/).filter(Boolean);
  const aText = parts[0]?.trim() || cleaned || '선택지 A';
  const bText = parts[1]?.trim() || '선택지 B';
  const headline = `${aText} vs ${bText}`;

  return [
    makeCut({
      role: 'hook',
      headline,
      subtitle: `*${aText}* 아니면 *${bText}*, 고르신다면?`,
      narration: `${aText}, 아니면 ${bText}. 고르신다면?`,
      duration: 3,
      theme,
    }),
    makeCut({
      role: 'body',
      headline: `A. ${aText}`,
      subtitle: `${aText}를 고르면 *얻는 것*과 *잃는 것*이 있습니다`,
      narration: `${aText}를 고르면 얻는 것과 잃는 것이 있습니다.`,
      duration: 5,
      theme,
    }),
    makeCut({
      role: 'body',
      headline: `B. ${bText}`,
      subtitle: `${bText}를 고르면 *하루의 모양*이 바뀝니다`,
      narration: `${bText}를 고르면 하루의 모양이 바뀝니다.`,
      duration: 5,
      theme,
    }),
    makeCut({
      role: 'cta',
      headline: '당신의 선택은?',
      subtitle: '댓글에 *A* 아니면 *B* 남겨주세요',
      narration: '댓글에 A 아니면 B 남겨주세요.',
      duration: 4,
      theme,
    }),
  ];
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
    headline: { enabled: true, sizePx: 84 },
    voice: { voiceURI: '', voiceName: '', lang: 'ko-KR', rate: 1.05, pitch: 1, volume: 1 },
    bgm: { mood: bgm, volume: 0.22 },
    updatedAt: Date.now(),
  };
}
