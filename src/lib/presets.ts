import type { BgmMood, CaptionStyle, Shorts, TemplateId, Tone } from '../types';
import { buildLocalShorts } from './localEngine';
import { DEFAULT_AUDIO, DEFAULT_BRAND } from './defaults';

/**
 * 원클릭 상용 템플릿 — 한 번 누르면 대본·컷 길이·자막 톤·배경음까지 끝난 상태로 재생됩니다.
 * (그림은 31장 일러스트 라이브러리에서 대본의 장면에 맞춰 새로 배정됩니다)
 */

export interface CommercialPreset {
  id: string;
  label: string;
  emoji: string;
  tagline: string;
  /** 이 템플릿이 노리는 반응 */
  goal: string;
  template: TemplateId;
  tone: Tone;
  mood: BgmMood;
  style: CaptionStyle;
  title: string;
  topic: string;
  banner: string;
}

export const PRESETS: CommercialPreset[] = [
  {
    id: 'balance-game',
    label: '직장인 밸런스 게임',
    emoji: '⚖️',
    tagline: '출근길 3초에 손가락을 멈추는 10컷 A/B',
    goal: '댓글·투표 유도',
    template: 'balance',
    tone: 'cider',
    mood: 'trendy',
    style: { theme: 'impact', position: 'bottom', size: 'm' },
    title: '월급 1.5배 vs 칼퇴',
    topic: '월급 1.5배 vs 칼퇴',
    banner: '직장인 밸런스',
  },
  {
    id: 'love-story',
    label: '연애 썰',
    emoji: '💌',
    tagline: '읽다가 내 얘기 같아지는 10컷',
    goal: '댓글·공유 유도',
    template: 'love',
    tone: 'empathy',
    mood: 'romance',
    style: { theme: 'bubble', position: 'bottom', size: 'm' },
    title: '소개팅 첫 카톡',
    topic: '소개팅 첫 카톡 예시',
    banner: '연애 썰',
  },
  {
    id: 'review',
    label: '제품·맛집 리뷰',
    emoji: '🍽️',
    tagline: '광고가 아닌 후기 — 저장·공유가 붙는 구성',
    goal: '저장·검색 유입',
    template: 'review',
    tone: 'cider',
    mood: 'comic',
    style: { theme: 'minimal', position: 'bottom', size: 'm' },
    title: '줄 서는 브런치 카페 후기',
    topic: '요즘 줄 서는 브런치 카페 솔직 후기',
    banner: '솔직 리뷰',
  },
  {
    id: 'issue-60',
    label: '60초 이슈 요약',
    emoji: '🗞️',
    tagline: '긴 뉴스를 1분으로 — 저장되는 정보형',
    goal: '저장·팔로우 유도',
    template: 'issue',
    tone: 'cider',
    mood: 'tension',
    style: { theme: 'impact', position: 'bottom', size: 'm' },
    title: '이번 주 이슈 세 줄 요약',
    topic: '이번 주 IT 이슈 세 줄 요약',
    banner: '이슈 요약',
  },
];

export const PRESET_MAP: Record<string, CommercialPreset> = PRESETS.reduce(
  (acc, preset) => {
    acc[preset.id] = preset;
    return acc;
  },
  {} as Record<string, CommercialPreset>,
);

/** 프리셋 하나를 실제 프로젝트로 — 대본·길이·자막 테마·배경음까지 한 번에. */
export function buildPresetShorts(preset: CommercialPreset): Shorts {
  const base = buildLocalShorts({ topic: preset.topic, template: preset.template, tone: preset.tone });
  return {
    ...base,
    title: preset.title,
    topic: preset.topic,
    banner: preset.banner,
    template: preset.template,
    tone: preset.tone,
    source: 'local',
    updatedAt: Date.now(),
    audio: { ...DEFAULT_AUDIO, mood: preset.mood },
    style: { ...preset.style },
    brand: { ...DEFAULT_BRAND },
  };
}
