/** 숏컷 스튜디오 — 화면·대본에 필요한 것만 남긴 자료 구조. */

export type Tone = 'cider' | 'empathy' | 'humor';
export type TemplateId = 'balance' | 'living' | 'love' | 'it';
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
}

export interface Palette {
  from: string;
  to: string;
  accent: string;
}
