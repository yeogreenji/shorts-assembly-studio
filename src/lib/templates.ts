import type { Palette, TemplateId, Tone } from '../types';

export const TONES: { id: Tone; label: string; emoji: string; hint: string }[] = [
  { id: 'cider', label: '사이다', emoji: '⚡', hint: '군더더기 없이 시원하게' },
  { id: 'empathy', label: '공감', emoji: '🫂', hint: '내 얘기처럼 다정하게' },
  { id: 'humor', label: '유머', emoji: '😂', hint: '한 번 비틀어서 웃기게' },
];

export const TONE_LABEL: Record<Tone, string> = { cider: '사이다', empathy: '공감', humor: '유머' };

export interface TemplateDef {
  id: TemplateId;
  label: string;
  emoji: string;
  tagline: string;
  banner: string;
  palette: Palette;
  /** 칩을 누르면 채워지는 추천 주제 */
  topics: string[];
  cards: string[];
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'balance',
    label: '직장인 밸런스',
    emoji: '⚖️',
    tagline: '둘 중 하나, 댓글창이 열린다',
    banner: '직장인 밸런스',
    palette: { from: '#ff6b6b', to: '#5b21b6', accent: '#fde047' },
    topics: ['월급 1.5배 vs 칼퇴', '재택근무 vs 연봉 20% 인상', '점심 2시간 vs 칼퇴 30분'],
    cards: ['🥊', '💸', '😵', '🏃', '🫠', '💬'],
  },
  {
    id: 'love',
    label: '연애 썰',
    emoji: '💌',
    tagline: '읽다가 내 얘기 같아짐',
    banner: '연애 썰',
    palette: { from: '#fb7185', to: '#6d28d9', accent: '#fde68a' },
    topics: ['소개팅 첫 카톡 예시', '연애 초반에 하면 안 되는 말', '썸 탈 때 확실한 신호'],
    cards: ['💌', '💬', '😳', '📱', '🫠', '💘'],
  },
  {
    id: 'review',
    label: '제품·맛집 리뷰',
    emoji: '🍽️',
    tagline: '한 번 먹어본 사람의 솔직 후기',
    banner: '솔직 리뷰',
    palette: { from: '#f59e0b', to: '#7c2d12', accent: '#fde68a' },
    topics: ['요즘 줄 서는 브런치 카페 솔직 후기', '3만원대 무선 이어폰 한 달 써본 후기', '집에서 만드는 편의점 야식 조합'],
    cards: ['🍽️', '👀', '💰', '👍', '🤔', '💬'],
  },
  {
    id: 'issue',
    label: '60초 이슈 요약',
    emoji: '🗞️',
    tagline: '오늘의 이슈를 1분에 정리',
    banner: '이슈 요약',
    palette: { from: '#38bdf8', to: '#111c4d', accent: '#a5f3fc' },
    topics: ['이번 주 IT 이슈 세 줄 요약', '요즘 난리 난 AI 서비스 정리', '환율·금리 뉴스 한 번에'],
    cards: ['🗞️', '📌', '🔍', '📊', '⚠️', '💬'],
  },
  {
    id: 'living',
    label: '자취 꿀팁',
    emoji: '🏠',
    tagline: '혼자 사는 사람만 아는 것',
    banner: '자취 꿀팁',
    palette: { from: '#14b8a6', to: '#0b3b52', accent: '#99f6e4' },
    topics: ['자취 3년차가 아는 꿀팁', '첫 자취, 사면 후회하는 것', '월세 아끼는 방법'],
    cards: ['🏠', '🔌', '💡', '🧺', '🛒', '💬'],
  },
  {
    id: 'it',
    label: 'IT 트렌드',
    emoji: '🤖',
    tagline: '한 줄로 정리되는 기술 이야기',
    banner: 'IT 트렌드',
    palette: { from: '#3b82f6', to: '#101a4d', accent: '#67e8f9' },
    topics: ['AI 앱 제대로 쓰는 법', '요즘 뜨는 IT 트렌드', '앱 출시 전 체크리스트'],
    cards: ['🤖', '⚡', '🔍', '🔒', '📈', '💬'],
  },
];

export const TEMPLATE_MAP: Record<TemplateId, TemplateDef> = TEMPLATES.reduce(
  (acc, template) => {
    acc[template.id] = template;
    return acc;
  },
  {} as Record<TemplateId, TemplateDef>,
);

/** 컷 순서에 맞춘 기본 카메라 무빙. */
export const CAMERA_BY_INDEX = ['push', 'drift', 'punch', 'push', 'drift', 'pull'] as const;
export type CameraMove = (typeof CAMERA_BY_INDEX)[number];

export function cameraFor(index: number): CameraMove {
  return CAMERA_BY_INDEX[index % CAMERA_BY_INDEX.length] ?? 'push';
}

/** 컷 기본 길이 — 여섯 컷 합계 약 17.8초. */
export const CUT_DURATIONS = [2.8, 3.0, 3.0, 3.0, 2.9, 3.0];

/** 60초 요약처럼 긴 포맷의 컷 길이. */
export const LONG_DURATIONS = [7.5, 9.5, 9.5, 9.5, 9.5, 9.5];

/** 컷 길이를 다듬을 때 쓸 수 있는 범위(초). */
export const MIN_CUT_SECONDS = 0.8;
export const MAX_CUT_SECONDS = 12;

export function roleOf(index: number, total = 6): 'hook' | 'body' | 'cta' {
  if (index === 0) return 'hook';
  if (index === total - 1) return 'cta';
  return 'body';
}

export function roleLabel(index: number, total = 6, template?: TemplateId): string {
  const role = roleOf(index, total);
  if (role === 'hook') return '훅';
  if (role === 'cta') {
    if (template === 'balance') return '투표 유도';
    if (template === 'love') return '댓글 유도';
    return '저장 유도';
  }
  return `포인트 ${index}`;
}
