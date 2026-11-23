import type { BgmMood, CaptionStyle, Shorts, TemplateId, Tone } from '../types';
import { buildLocalShorts } from './localEngine';
import { DEFAULT_AUDIO, DEFAULT_BRAND } from './defaults';

/**
 * 원클릭 상용 템플릿 — 한 번 누르면 대본·컷 길이·자막 톤·배경음까지 끝난 상태로 재생됩니다.
 * (그림은 31장 일러스트 라이브러리에서 주제에 맞춰 새로 배정됩니다)
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
  durations: number[];
  lines: string[];
}

export const PRESETS: CommercialPreset[] = [
  {
    id: 'balance-game',
    label: '직장인 밸런스 게임',
    emoji: '⚖️',
    tagline: '출근길 3초에 손가락을 멈추는 A/B',
    goal: '댓글·투표 유도',
    template: 'balance',
    tone: 'cider',
    mood: 'trendy',
    style: { theme: 'impact', position: 'bottom', size: 'm' },
    title: '월급 1.5배 vs 칼퇴',
    topic: '월급 1.5배 vs 칼퇴',
    banner: '직장인 밸런스',
    durations: [2.8, 3.0, 3.0, 3.0, 2.9, 3.0],
    lines: [
      '월급 *1.5배* vs *칼퇴*, 딱 하나만',
      '1번. 월급 *1.5배*, 대신 밤 9시 퇴근',
      '주말에도 *단톡방*이 따라옵니다',
      '2번. *칼퇴* 보장, 월급은 3년째 동결',
      '점심 먹는데 팀장이 "*바쁘지?*"',
      '댓글로 *1번*이야 *2번*이야',
    ],
  },
  {
    id: 'love-story',
    label: '연애 썰',
    emoji: '💌',
    tagline: '읽다가 내 얘기 같아지는 6컷',
    goal: '댓글·공유 유도',
    template: 'love',
    tone: 'empathy',
    mood: 'romance',
    style: { theme: 'bubble', position: 'bottom', size: 'm' },
    title: '소개팅 첫 카톡',
    topic: '소개팅 첫 카톡 예시',
    banner: '연애 썰',
    durations: [3.0, 3.2, 3.0, 3.0, 3.0, 3.2],
    lines: [
      '첫 카톡, *이 한 줄*이면 대화가 열려요',
      '"오늘 *뭐 먹었어요*?" 이거 하나면 돼요',
      '답장은 *속도*보다 *내용*이에요',
      '이모티콘은 *한 개*면 충분해요',
      '약속은 *내가* 먼저 잡으면 돼요',
      '너무 *애쓰지* 않아도 괜찮아요',
    ],
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
    durations: [2.8, 3.0, 3.0, 3.0, 2.9, 3.2],
    lines: [
      '웨이팅 *40분* 하고 먹은 브런치, 솔직히',
      '*플레이팅*은 사진보다 예뻤어요',
      '대신 *커피*는 평범, 6천원',
      '*리코타* 토스트가 진짜 주인공',
      '주말 *11시 전*이면 대기 없어요',
      '가실 거면 *평일 오전* 추천해요',
    ],
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
    durations: [7.5, 9.5, 9.5, 9.5, 9.5, 9.5],
    lines: [
      '이번 주 *세 줄*, 1분이면 끝납니다',
      '첫째. AI 기능은 *요금제*로 재편 — 무료 범위가 줄었습니다',
      '둘째. 앱은 *로그인*부터 줄이는 중 — 비회원 체험이 기본',
      '셋째. 보안은 *패스키*로 이동 — 비밀번호 입력이 사라집니다',
      '결론. *지켜볼 것* 세 가지, 요금·로그인·보안',
      '저장해두면 *다음 주*에도 통합니다',
    ],
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
    cuts: base.cuts.map((cut, index) => ({
      ...cut,
      subtitle: preset.lines[index] ?? cut.subtitle,
      duration: preset.durations[index] ?? cut.duration,
    })),
  };
}
