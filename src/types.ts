/** 숏컷 스튜디오 — 화면·대본·사운드에 필요한 것만 남긴 자료 구조. */

export type Tone = 'cider' | 'empathy' | 'humor';
export type TemplateId = 'balance' | 'living' | 'love' | 'review' | 'it' | 'issue';
export type ShotRole = 'hook' | 'body' | 'cta';

/**
 * 컷별 장면 지시. AI가 쓰거나 내장 엔진이 만들며,
 * 모션 일러스트(배경·인물·소품·카메라)의 재료가 됩니다.
 * 글자는 짧은 키워드이고, 렌더러가 키워드를 읽어 그림을 고릅니다.
 */
export interface CutVisual {
  /** 장소·배경 키워드 (예: '퇴근길 지하철', '자취방 주방') */
  scene: string;
  /** 화면의 주인공/대상 (예: '직장인', '혼자 사는 20대') */
  subject: string;
  /** 표정 (예: '지친', '놀란', '웃는') */
  expression: string;
  /** 동작 (예: '지갑을 여는', '휴대폰을 보는') */
  action: string;
  /** 카메라 무빙 (예: 'push-in', 'shake') */
  camera: string;
  /** 화면에 놓을 소품 (예: ['지폐', '커피']) */
  props: string[];
  /** 분위기 (예: 'tense', 'warm', 'comic') */
  mood: string;
  /** 강조색 후보 (hex 2~3개, 없으면 템플릿 색) */
  palette?: string[];
}

/** 사용자가 올린 내 이미지 — 본문에는 참조만 두고 그림은 따로 보관합니다. */
export interface ShotImage {
  id: string;
  name: string;
}

export interface Shot {
  id: string;
  role: ShotRole;
  /** 컷에 붙는 이모지 한 글자 */
  emoji: string;
  /** 화면에 크게 뜨는 자막 한 줄. *별표*로 감싼 단어는 강조색으로 뜹니다. */
  subtitle: string;
  /** 이 컷이 화면에 머무는 시간(초) */
  duration: number;
  /** 이 컷의 그림 지시 — 없으면 렌더러가 자막에서 유추합니다. */
  visual?: CutVisual;
  /** 31장 일러스트 대신 이 컷에만 쓸 내 사진·캡처. */
  image?: ShotImage;
}

/* ── 사운드 ─────────────────────────────────────────────── */

export type BgmMood = 'off' | 'trendy' | 'romance' | 'tension' | 'comic';

/** 나레이션 보이스 — 서버 음성 한 가지를 배속·톤으로 갈라 씁니다. */
export type VoiceId = 'clear' | 'fast' | 'calm' | 'low';

export interface AudioSettings {
  /** 배경음 무드 — off면 무음 영상 */
  mood: BgmMood;
  /** 0~1 배경음 볼륨 */
  volume: number;
  /** 음소거 — 영상에도 배경음이 들어가지 않습니다 */
  muted: boolean;
  /** 컷이 바뀔 때 휙 넘어가는 효과음 */
  accents: boolean;
  /** 나레이션(TTS) — 미리보기와 저장 영상 모두에 들어갑니다 */
  narration: boolean;
  /** 보이스 프리셋 */
  voice: VoiceId;
  /** 프리셋 위에 한 번 더 거는 속도 배율(0.8~1.3) */
  voiceRate: number;
  /** 0~1 음성 볼륨 */
  voiceVolume: number;
  /** 음성이 나오는 동안 배경음을 자동으로 낮춥니다 */
  ducking: boolean;
}

/* ── 자막 ───────────────────────────────────────────────── */

export type CaptionTheme = 'impact' | 'bubble' | 'neon' | 'minimal';
export type CaptionPosition = 'top' | 'middle' | 'bottom';
export type CaptionSize = 's' | 'm' | 'l';

export interface CaptionStyle {
  theme: CaptionTheme;
  position: CaptionPosition;
  size: CaptionSize;
}

/* ── 브랜드 워터마크 ────────────────────────────────────── */

export type BrandCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface BrandSettings {
  enabled: boolean;
  /** 채널 핸들 — @ 없이 저장하고 화면에는 @를 붙여 그립니다. */
  handle: string;
  corner: BrandCorner;
  /** 워터마크에 함께 넣을 로고 이미지(내 이미지 보관함의 id). */
  logoId?: string;
}

export interface Shorts {
  title: string;
  topic: string;
  template: TemplateId;
  tone: Tone;
  /** 영상 위에 고정으로 뜨는 짧은 라벨 */
  banner: string;
  cuts: Shot[];
  source: 'local' | 'ai';
  updatedAt: number;
  /** 이번 영상의 그림 시드 — 새로 만들 때마다 바뀌어 장면이 전부 달라집니다. */
  seed?: string;
  audio: AudioSettings;
  style: CaptionStyle;
  brand: BrandSettings;
}

export interface Palette {
  from: string;
  to: string;
  accent: string;
}
