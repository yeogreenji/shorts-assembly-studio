import type { EffectId } from './scene';

/**
 * 웹툰·로맨스 판타지 스타일 일러스트 라이브러리.
 * 생성한 9:16 일러스트(public/webtoon/*.webp)에 붙인 메타데이터로,
 * 컷의 장소·표정·분위기 키워드를 읽어 어떤 그림을 쓸지 고릅니다.
 * tags 의 한국어 단어가 대본·장면 지시와 맞을수록 점수가 올라갑니다.
 */

export type ArtGenre = 'royal' | 'office' | 'rain' | 'cafe' | 'comic' | 'night' | 'cozy' | 'nature';
export type ArtShot = 'close' | 'medium' | 'wide' | 'two-shot';
export type ArtExpression = 'neutral' | 'smile' | 'smirk' | 'tired' | 'sad' | 'shock' | 'angry' | 'dizzy' | 'smug';

export interface ArtDef {
  id: string;
  /** public 기준 경로 */
  file: string;
  /** 화면에 보여 주는 장면 이름 */
  title: string;
  genre: ArtGenre;
  shot: ArtShot;
  expression: ArtExpression;
  /** 켄 번즈 줌의 중심점 (0~1) — 얼굴이 화면 밖으로 나가지 않게 */
  focus: { x: number; y: number };
  /** 자막 강조색·빛 번짐에 쓰는 색 */
  accent: string;
  /** 대본 키워드와 맞춰 보는 단어들 */
  tags: string[];
  /** 그림과 함께 흐르는 공기(비·꽃잎 등) */
  weather: EffectId[];
  /** 앞쪽에 얹는 효과 */
  effects: EffectId[];
  /** 그림 위에 얹는 빛의 세기 */
  light: number;
  /** 로딩 중 배경으로 쓰는 대표색 */
  tones: { top: string; mid: string; bottom: string };
}

export const ARTS: ArtDef[] = [
  {
    id: 'rf-ballroom',
    file: 'webtoon/rf-ballroom.webp',
    title: '은빛 드레스의 무도회',
    genre: 'royal',
    shot: 'medium',
    expression: 'neutral',
    focus: { x: 0.60, y: 0.24 },
    accent: '#ffd6f2',
    tags: ['궁정', '무도회', '드레스', '로판', '귀족', '황녀', '공작', '판타지', '왕궁', '결혼'],
    weather: [],
    effects: ['sparkle', 'bokeh'],
    light: 0.95,
    tones: { top: '#b38b9c', mid: '#c098a6', bottom: '#b994a3' },
  },
  {
    id: 'rf-court',
    file: 'webtoon/rf-court.webp',
    title: '손을 내미는 공작',
    genre: 'royal',
    shot: 'two-shot',
    expression: 'smirk',
    focus: { x: 0.50, y: 0.22 },
    accent: '#ffc98a',
    tags: ['궁정', '공작', '귀족', '로판', '계약', '결혼', '드레스', '판타지', '왕궁', '긴장'],
    weather: [],
    effects: ['sparkle', 'dust'],
    light: 0.9,
    tones: { top: '#654b37', mid: '#4b3528', bottom: '#332018' },
  },
  {
    id: 'rf-garden-night',
    file: 'webtoon/rf-garden-night.webp',
    title: '달빛 정원의 산책',
    genre: 'royal',
    shot: 'medium',
    expression: 'smile',
    focus: { x: 0.42, y: 0.30 },
    accent: '#ffb3e6',
    tags: ['정원', '달빛', '로판', '드레스', '꽃', '산책', '판타지', '고백', '설렘', '밤'],
    weather: ['petals'],
    effects: ['bokeh', 'sparkle'],
    light: 0.9,
    tones: { top: '#3c3c6e', mid: '#61405d', bottom: '#815674' },
  },
  {
    id: 'rf-throne-hall',
    file: 'webtoon/rf-throne-hall.webp',
    title: '황궁의 대연회장',
    genre: 'royal',
    shot: 'wide',
    expression: 'neutral',
    focus: { x: 0.50, y: 0.55 },
    accent: '#ffcf7a',
    tags: ['왕궁', '궁정', '연회', '궁전', '판타지', '로판', '드레스', '귀족', '축하'],
    weather: [],
    effects: ['dust', 'sparkle'],
    light: 1.0,
    tones: { top: '#a17255', mid: '#98603a', bottom: '#753e2e' },
  },
  {
    id: 'rf-male-lead',
    file: 'webtoon/rf-male-lead.webp',
    title: '황실 근위대장',
    genre: 'royal',
    shot: 'medium',
    expression: 'smirk',
    focus: { x: 0.50, y: 0.20 },
    accent: '#f7c96b',
    tags: ['공작', '남주', '귀족', '황실', '군복', '로판', '판타지', '궁정', '무도회'],
    weather: [],
    effects: ['dust', 'bokeh'],
    light: 0.95,
    tones: { top: '#705d54', mid: '#7b685d', bottom: '#25201d' },
  },
  {
    id: 'rf-snow-palace',
    file: 'webtoon/rf-snow-palace.webp',
    title: '눈 내리는 궁정',
    genre: 'royal',
    shot: 'medium',
    expression: 'sad',
    focus: { x: 0.50, y: 0.24 },
    accent: '#c3e6ff',
    tags: ['눈', '겨울', '궁정', '로판', '드레스', '추위', '판타지', '이별', '슬픔'],
    weather: ['snow'],
    effects: ['bokeh'],
    light: 0.9,
    tones: { top: '#78809e', mid: '#8793b5', bottom: '#8592b8' },
  },
  {
    id: 'office-desk-night',
    file: 'webtoon/office-desk-night.webp',
    title: '야근 중인 사무실',
    genre: 'office',
    shot: 'medium',
    expression: 'tired',
    focus: { x: 0.58, y: 0.30 },
    accent: '#ffd9a8',
    tags: ['야근', '사무실', '회사', '업무', '직장', '노트북', '밤', '월급', '퇴근', '보고서'],
    weather: [],
    effects: ['dust', 'bokeh'],
    light: 0.85,
    tones: { top: '#393533', mid: '#726259', bottom: '#695f5d' },
  },
  {
    id: 'office-meeting-shock',
    file: 'webtoon/office-meeting-shock.webp',
    title: '회의실의 충격',
    genre: 'office',
    shot: 'close',
    expression: 'shock',
    focus: { x: 0.34, y: 0.30 },
    accent: '#9ad6ff',
    tags: ['회의', '회의실', '충격', '당황', '놀란', '상사', '팀장', '사무실', '업무', '반전'],
    weather: [],
    effects: ['speedlines', 'sweat'],
    light: 0.85,
    tones: { top: '#52545a', mid: '#595562', bottom: '#29272b' },
  },
  {
    id: 'office-coffee-smile',
    file: 'webtoon/office-coffee-smile.webp',
    title: '커피 한 잔의 여유',
    genre: 'office',
    shot: 'medium',
    expression: 'smile',
    focus: { x: 0.42, y: 0.26 },
    accent: '#ffe0b8',
    tags: ['커피', '사무실', '아침', '출근', '회사', '웃는', '휴식', '동료', '점심'],
    weather: [],
    effects: ['steam', 'sparkle'],
    light: 1.0,
    tones: { top: '#af9f99', mid: '#c3b1a8', bottom: '#96857e' },
  },
  {
    id: 'office-elevator-suit',
    file: 'webtoon/office-elevator-suit.webp',
    title: '엘리베이터의 정장남',
    genre: 'office',
    shot: 'medium',
    expression: 'smirk',
    focus: { x: 0.30, y: 0.20 },
    accent: '#8fd6ff',
    tags: ['정장', '엘리베이터', '남자', '회사', '출근', '퇴근', '동료', '설렘', '오피스'],
    weather: [],
    effects: ['bokeh', 'dust'],
    light: 0.9,
    tones: { top: '#3b3b37', mid: '#353634', bottom: '#161b1e' },
  },
  {
    id: 'office-rooftop-sunset',
    file: 'webtoon/office-rooftop-sunset.webp',
    title: '옥상에서의 노을',
    genre: 'office',
    shot: 'medium',
    expression: 'neutral',
    focus: { x: 0.45, y: 0.22 },
    accent: '#ffb070',
    tags: ['옥상', '노을', '퇴근', '쉼', '하루', '저녁', '직장', '도시', '정장'],
    weather: [],
    effects: ['bokeh', 'light'],
    light: 1.0,
    tones: { top: '#ad9176', mid: '#7c6a64', bottom: '#61534f' },
  },
  {
    id: 'office-showdown',
    file: 'webtoon/office-showdown.webp',
    title: '상사와의 대치',
    genre: 'office',
    shot: 'two-shot',
    expression: 'angry',
    focus: { x: 0.55, y: 0.26 },
    accent: '#a5c8ff',
    tags: ['상사', '팀장', '대치', '화', '회사', '사무실', '업무', '갈등', '퇴사', '이직'],
    weather: [],
    effects: ['speedlines', 'dust'],
    light: 0.85,
    tones: { top: '#69686f', mid: '#605e64', bottom: '#28262a' },
  },
  {
    id: 'rain-umbrella-couple',
    file: 'webtoon/rain-umbrella-couple.webp',
    title: '비 오는 밤, 우산 아래',
    genre: 'rain',
    shot: 'two-shot',
    expression: 'neutral',
    focus: { x: 0.48, y: 0.50 },
    accent: '#8ee6ff',
    tags: ['비', '우산', '밤', '거리', '커플', '데이트', '설렘', '연애', '골목'],
    weather: ['rain'],
    effects: ['bokeh'],
    light: 0.95,
    tones: { top: '#292c50', mid: '#6e6073', bottom: '#2e2933' },
  },
  {
    id: 'rain-alone',
    file: 'webtoon/rain-alone.webp',
    title: '혼자 남은 비 오는 거리',
    genre: 'rain',
    shot: 'medium',
    expression: 'sad',
    focus: { x: 0.58, y: 0.30 },
    accent: '#9fd0ff',
    tags: ['비', '우산', '혼자', '이별', '슬픔', '서운', '후회', '거리', '밤거리', '울'],
    weather: ['rain'],
    effects: ['bokeh'],
    light: 0.9,
    tones: { top: '#473c47', mid: '#473d46', bottom: '#1a1417' },
  },
  {
    id: 'rain-window',
    file: 'webtoon/rain-window.webp',
    title: '빗물에 비친 얼굴',
    genre: 'rain',
    shot: 'close',
    expression: 'sad',
    focus: { x: 0.56, y: 0.40 },
    accent: '#7fd4ff',
    tags: ['비', '창가', '얼굴', '슬픔', '그리움', '밤', '카페', '후회', '이별'],
    weather: ['rain'],
    effects: ['bokeh'],
    light: 0.9,
    tones: { top: '#292e2d', mid: '#453e36', bottom: '#44372a' },
  },
  {
    id: 'cafe-date',
    file: 'webtoon/cafe-date.webp',
    title: '창가 자리의 미소',
    genre: 'cafe',
    shot: 'medium',
    expression: 'smile',
    focus: { x: 0.34, y: 0.30 },
    accent: '#ffcf9e',
    tags: ['카페', '커피', '소개팅', '데이트', '연애', '썸', '미소', '웃는', '점심', '휴식'],
    weather: [],
    effects: ['sparkle', 'bokeh'],
    light: 1.0,
    tones: { top: '#9d8065', mid: '#af8668', bottom: '#b29072' },
  },
  {
    id: 'cafe-two-shot',
    file: 'webtoon/cafe-two-shot.webp',
    title: '마주 앉은 두 사람',
    genre: 'cafe',
    shot: 'two-shot',
    expression: 'smirk',
    focus: { x: 0.50, y: 0.32 },
    accent: '#ffc48f',
    tags: ['카페', '소개팅', '데이트', '썸', '고백', '연애', '커플', '마주', '설렘'],
    weather: [],
    effects: ['bokeh', 'heart'],
    light: 1.0,
    tones: { top: '#9f8263', mid: '#805c42', bottom: '#866344' },
  },
  {
    id: 'cafe-hands',
    file: 'webtoon/cafe-hands.webp',
    title: '라테 두 잔',
    genre: 'cafe',
    shot: 'close',
    expression: 'smile',
    focus: { x: 0.50, y: 0.24 },
    accent: '#ffd2a1',
    tags: ['카페', '라테', '커피', '손', '데이트', '썸', '설렘', '연애', '소개팅'],
    weather: [],
    effects: ['steam', 'heart'],
    light: 1.0,
    tones: { top: '#8f725b', mid: '#6d503a', bottom: '#7b5f46' },
  },
  {
    id: 'comic-exasperated',
    file: 'webtoon/comic-exasperated.webp',
    title: '한숨 나오는 순간',
    genre: 'comic',
    shot: 'close',
    expression: 'dizzy',
    focus: { x: 0.45, y: 0.28 },
    accent: '#7cf0d0',
    tags: ['코믹', '당황', '한숨', '짜증', '유머', '웃김', '멘붕', '지친', '황당'],
    weather: [],
    effects: ['speedlines', 'sweat'],
    light: 1.0,
    tones: { top: '#aca89a', mid: '#cfcdbc', bottom: '#cdcbbd' },
  },
  {
    id: 'shock-closeup',
    file: 'webtoon/shock-closeup.webp',
    title: '믿기지 않는 순간',
    genre: 'comic',
    shot: 'close',
    expression: 'shock',
    focus: { x: 0.60, y: 0.42 },
    accent: '#d7b0ff',
    tags: ['충격', '놀란', '반전', '소름', '헉', '깜짝', '눈', '사이다'],
    weather: [],
    effects: ['speedlines', 'bolt'],
    light: 0.8,
    tones: { top: '#6b5666', mid: '#a78ea1', bottom: '#9c88a5' },
  },
  {
    id: 'victory-smug',
    file: 'webtoon/victory-smug.webp',
    title: '해냈다, 사이다',
    genre: 'comic',
    shot: 'medium',
    expression: 'smug',
    focus: { x: 0.40, y: 0.26 },
    accent: '#ff8ad8',
    tags: ['성공', '사이다', '뿌듯', '승리', '해냈', '최고', '자신감', '칭찬', '1등'],
    weather: [],
    effects: ['sparkle', 'confetti'],
    light: 1.0,
    tones: { top: '#4f2a3c', mid: '#552c43', bottom: '#34192f' },
  },
  {
    id: 'money-shower',
    file: 'webtoon/money-shower.webp',
    title: '월급이 쏟아진다',
    genre: 'comic',
    shot: 'medium',
    expression: 'smug',
    focus: { x: 0.42, y: 0.30 },
    accent: '#ffe066',
    tags: ['돈', '월급', '연봉', '지폐', '수입', '인상', '보너스', '성과', '부자', '월세'],
    weather: [],
    effects: ['money', 'sparkle'],
    light: 1.0,
    tones: { top: '#b9987c', mid: '#a18372', bottom: '#806b5a' },
  },
  {
    id: 'it-launch',
    file: 'webtoon/it-launch.webp',
    title: '출시 성공',
    genre: 'night',
    shot: 'two-shot',
    expression: 'smile',
    focus: { x: 0.45, y: 0.33 },
    accent: '#7ee8ff',
    tags: ['출시', '성공', '앱', '개발', '스타트업', '축하', '트렌드', '서비스', '팀', '성과'],
    weather: [],
    effects: ['confetti', 'sparkle'],
    light: 1.0,
    tones: { top: '#47579d', mid: '#5a5280', bottom: '#3f4481' },
  },
  {
    id: 'neon-alley',
    file: 'webtoon/neon-alley.webp',
    title: '네온 골목',
    genre: 'night',
    shot: 'wide',
    expression: 'neutral',
    focus: { x: 0.50, y: 0.55 },
    accent: '#ff62d0',
    tags: ['네온', '도시', '밤', '골목', '거리', '야경', '디지털', '미래', '사이버'],
    weather: [],
    effects: ['bokeh', 'dust'],
    light: 1.0,
    tones: { top: '#2c2945', mid: '#394569', bottom: '#343452' },
  },
  {
    id: 'neon-studio',
    file: 'webtoon/neon-studio.webp',
    title: 'AI 작업실',
    genre: 'night',
    shot: 'medium',
    expression: 'neutral',
    focus: { x: 0.45, y: 0.32 },
    accent: '#6ee7ff',
    tags: ['ai', '인공지능', '기술', '개발', '프롬프트', '작업', '늦은', '컴퓨터', '트렌드', '디지털'],
    weather: [],
    effects: ['bokeh', 'dust', 'sparkle'],
    light: 0.9,
    tones: { top: '#151939', mid: '#313054', bottom: '#1e244d' },
  },
  {
    id: 'city-night-skyline',
    file: 'webtoon/city-night-skyline.webp',
    title: '도시의 밤',
    genre: 'night',
    shot: 'wide',
    expression: 'neutral',
    focus: { x: 0.50, y: 0.42 },
    accent: '#8ab4ff',
    tags: ['도시', '야경', '밤', '서울', '커플', '로맨스', '하늘', '전망', '퇴근'],
    weather: [],
    effects: ['bokeh', 'sparkle'],
    light: 1.0,
    tones: { top: '#192c50', mid: '#3c3d4f', bottom: '#373644' },
  },
  {
    id: 'cozy-room-night',
    file: 'webtoon/cozy-room-night.webp',
    title: '불 끄기 전 자취방',
    genre: 'cozy',
    shot: 'medium',
    expression: 'tired',
    focus: { x: 0.38, y: 0.50 },
    accent: '#ffbd8a',
    tags: ['자취', '원룸', '방', '집', '밤', '고양이', '반려', '노트북', '휴식', '혼자'],
    weather: [],
    effects: ['dust', 'bokeh'],
    light: 0.9,
    tones: { top: '#322b2b', mid: '#5f463c', bottom: '#513e38' },
  },
  {
    id: 'cozy-kitchen-morning',
    file: 'webtoon/cozy-kitchen-morning.webp',
    title: '아침의 주방',
    genre: 'cozy',
    shot: 'medium',
    expression: 'smile',
    focus: { x: 0.60, y: 0.30 },
    accent: '#ffdda6',
    tags: ['아침', '주방', '요리', '커피', '집', '자취', '햇살', '살림', '청소'],
    weather: ['petals'],
    effects: ['steam', 'sparkle'],
    light: 1.0,
    tones: { top: '#a89173', mid: '#caab81', bottom: '#c7ac8f' },
  },
  {
    id: 'park-cherry',
    file: 'webtoon/park-cherry.webp',
    title: '벚꽃 산책',
    genre: 'nature',
    shot: 'medium',
    expression: 'smile',
    focus: { x: 0.50, y: 0.30 },
    accent: '#ffc8d8',
    tags: ['벚꽃', '봄', '산책', '공원', '주말', '여행', '데이트', '바람', '피크닉'],
    weather: ['petals'],
    effects: ['bokeh', 'sparkle'],
    light: 1.0,
    tones: { top: '#d9bab8', mid: '#ba9e9b', bottom: '#ceb2b6' },
  },
  {
    id: 'subway-morning',
    file: 'webtoon/subway-morning.webp',
    title: '만원 지하철',
    genre: 'office',
    shot: 'medium',
    expression: 'tired',
    focus: { x: 0.45, y: 0.22 },
    accent: '#ffcf9e',
    tags: ['지하철', '출근길', '퇴근길', '만원', '환승', '버스', '아침', '직장', '피곤'],
    weather: [],
    effects: ['dust', 'bokeh'],
    light: 0.9,
    tones: { top: '#806a55', mid: '#896a53', bottom: '#493e32' },
  },
  {
    id: 'tears-closeup',
    file: 'webtoon/tears-closeup.webp',
    title: '눈물 한 방울',
    genre: 'rain',
    shot: 'close',
    expression: 'sad',
    focus: { x: 0.58, y: 0.40 },
    accent: '#9fc4ff',
    tags: ['눈물', '울', '슬픔', '서운', '이별', '후회', '감정', '그리움', '힘든'],
    weather: [],
    effects: ['bokeh'],
    light: 0.85,
    tones: { top: '#2b304d', mid: '#555373', bottom: '#364267' },
  },
];

import type { TemplateId, Tone } from '../../types';
import type { Rng } from './rng';

const ART_MAP = new Map(ARTS.map((art) => [art.id, art]));

export function artById(id: string | undefined): ArtDef | undefined {
  return id ? ART_MAP.get(id) : undefined;
}

/** 템플릿별로 잘 어울리는 장르 — 같은 주제라도 템플릿이 다르면 그림 결이 달라집니다. */
const TEMPLATE_AFFINITY: Record<TemplateId, Partial<Record<ArtGenre, number>>> = {
  balance: { office: 3, comic: 2.4, night: 1.2, cafe: 0.8 },
  living: { cozy: 3, nature: 2.2, cafe: 1.8, office: 0.8 },
  love: { cafe: 2.8, rain: 2.6, royal: 2.4, nature: 1.4, night: 0.8 },
  it: { night: 3, office: 2.8, comic: 1.2, cozy: 0.6 },
};

const TONE_AFFINITY: Record<Tone, Partial<Record<ArtGenre, number>>> = {
  cider: { office: 1.2, comic: 1.6, night: 0.8 },
  empathy: { rain: 1.6, cozy: 1.4, cafe: 1, nature: 0.8 },
  humor: { comic: 1.8, cozy: 0.6, office: 0.6 },
};

/** 표정 낱말 → 그림 표정 (대본의 '놀란' 같은 표현을 그림에 붙입니다) */
const EXPRESSION_WORDS: Record<ArtExpression, string[]> = {
  shock: ['놀란', '충격', '헉', '깜짝', '반전', '소름'],
  angry: ['화난', '짜증', '분노', '빡', '싫'],
  sad: ['슬픈', '시무룩', '울', '서운', '후회', '눈물'],
  tired: ['지친', '피곤', '야근', '무기력', '녹초'],
  smile: ['웃는', '기쁜', '행복', '좋아', '미소', '반가운'],
  smirk: ['비웃는', '비틀', '썸', '능글'],
  smug: ['뿌듯한', '성공', '승리', '의기양양', '해냈'],
  dizzy: ['혼란', '멘붕', '어리둥절', '당황', '한숨'],
  neutral: ['무표정', '담담한', '차분한'],
};

export function expressionFromWords(text: string): ArtExpression | null {
  let best: ArtExpression | null = null;
  let bestScore = 0;
  for (const [expression, words] of Object.entries(EXPRESSION_WORDS) as [ArtExpression, string[]][]) {
    const score = words.reduce((sum, word) => (text.includes(word) ? sum + 1 : sum), 0);
    if (score > bestScore) {
      best = expression;
      bestScore = score;
    }
  }
  return best;
}

/**
 * 주제만 보고 장르를 정합니다. '로판/계약 결혼/공작' 같은 말이 있으면 그 장르 그림으로 채워
 * 오피스 로맨스 대본에 궁정 그림이 섞이는 일을 막습니다.
 */
const TOPIC_GENRE_WORDS: Partial<Record<ArtGenre, string[]>> = {
  royal: ['로판', '판타지', '공작', '황녀', '황후', '황태자', '귀족', '드레스', '왕궁', '궁정', '무도회', '황실', '계약 결혼', '회귀', '악녀', '남주', '여주', '궁녀', '왕세자'],
  office: ['월급', '연봉', '칼퇴', '야근', '회사', '직장', '상사', '팀장', '출근', '퇴근', '이직', '면접', '승진', '사원', '대리', '과장', '회식', '재택', '오피스', '업무', '보고서'],
  comic: ['웃긴', '유머', '밈', '짤', '웃겨', '병맛'],
  cozy: ['자취', '원룸', '살림', '집들이', '요리'],
};

export function inferTopicGenre(text: string): ArtGenre | null {
  let best: ArtGenre | null = null;
  let bestScore = 0;
  for (const [genre, words] of Object.entries(TOPIC_GENRE_WORDS) as [ArtGenre, string[]][]) {
    const score = words.reduce((sum, word) => (text.includes(word) ? sum + 1 : sum), 0);
    const pool = ARTS.filter((art) => art.genre === genre).length;
    if (score > bestScore && pool >= 5) {
      best = genre;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

export interface ArtQuery {
  /** 컷의 장소·소품 등 좁은 문맥 (visual.scene + props) */
  scene: string;
  /** 주제·자막까지 포함한 넓은 문맥 */
  body: string;
  expression: ArtExpression | null;
  role: 'hook' | 'body' | 'cta';
  template: TemplateId;
  tone: Tone;
  rng: Rng;
  usedIds: Set<string>;
  previous?: ArtDef;
  /** 두 사람이 맞서는 구성이 어울리는 컷(A vs B) */
  versus?: boolean;
  /** 표정·구도가 주어진 결로 고정되길 바랄 때 */
  preferGenre?: ArtGenre;
  /** 이 장르 그림만 씁니다(주제가 장르를 확실히 말할 때) */
  genreLock?: ArtGenre | null;
}

function scoreArt(art: ArtDef, query: ArtQuery): number {
  let score = 0;
  for (const tag of art.tags) {
    if (query.scene.includes(tag)) score += 7;
    else if (query.body.includes(tag)) score += 2.6;
  }
  if (query.expression && art.expression === query.expression) score += 5;

  score += (TEMPLATE_AFFINITY[query.template][art.genre] ?? 0) * 2;
  score += (TONE_AFFINITY[query.tone][art.genre] ?? 0) * 1.4;
  if (query.preferGenre && art.genre === query.preferGenre) score += 6;

  if (query.role === 'hook') {
    if (art.shot === 'close') score += 3.2;
    if (art.expression === 'shock' || art.expression === 'dizzy') score += 2;
    if (art.effects.includes('speedlines')) score += 1.6;
  }
  if (query.role === 'cta') {
    if (art.expression === 'smile' || art.expression === 'smug') score += 3;
    if (art.shot === 'wide' || art.shot === 'medium') score += 1;
    if (art.effects.includes('confetti') || art.effects.includes('sparkle')) score += 1.2;
  }
  if (query.role === 'body' && (art.shot === 'medium' || art.shot === 'wide')) score += 1.4;
  if (query.versus && art.shot === 'two-shot') score += 3.2;

  if (query.usedIds.has(art.id)) score -= 100;
  if (query.previous) {
    if (query.previous.genre === art.genre) score -= 2.4;
    if (query.previous.shot === art.shot) score -= 1.2;
    // 컷마다 구도를 번갈아 — 같은 구도가 세 번 이어지지 않게
    if (query.previous.shot !== 'wide' && art.shot === 'wide') score += 0.8;
  }
  score += query.rng.range(0, 2.8);
  return score;
}

/**
 * 컷 하나에 붙일 일러스트를 고릅니다.
 * 장소·표정 키워드가 맞는 그림 중에서, 같은 영상에 이미 쓴 그림과 같은 결은 뒤로 미룹니다.
 * 시드가 바뀌면 점수가 비슷한 후보 중 다른 그림이 뽑혀 같은 주제라도 매번 새 영상이 됩니다.
 */
export function pickArt(query: ArtQuery): ArtDef {
  const locked = query.genreLock ? ARTS.filter((art) => art.genre === query.genreLock) : [];
  const pool = locked.length >= 5 ? locked : ARTS;
  const ranked = pool.filter((art) => !query.usedIds.has(art.id))
    .map((art) => ({ art, score: scoreArt(art, query) }))
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return ARTS[0]!;
  // 1~3위 안에서 시드로 뽑되, 1위가 확실히 앞서면(3점 이상) 그대로.
  const top = ranked.slice(0, 3);
  const best = top[0]!;
  const near = top.filter((row) => best.score - row.score < 3);
  const chosen = near[Math.floor(query.rng.next() * near.length)] ?? best;
  return chosen.art;
}
