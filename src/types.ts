/** 숏컷 스튜디오 — 화면·대본에 필요한 것만 남긴 자료 구조. */

export type Tone = 'cider' | 'empathy' | 'humor';
export type TemplateId = 'balance' | 'living' | 'love' | 'it';
export type ShotRole = 'hook' | 'body' | 'cta';

export interface Shot {
  id: string;
  role: ShotRole;
  /** 컷에 붙는 이모지 한 글자 */
  emoji: string;
  /** 화면에 크게 뜨는 자막 한 줄. *별표*로 감싼 단어는 강조색으로 뜹니다. */
  subtitle: string;
  /** 이 컷이 화면에 머무는 시간(초) */
  duration: number;
  /** 배경 다시 뽑기 횟수 (0이면 자막 키워드대로) */
  variant?: number;
}

export interface Shorts {
  title: string;
  topic: string;
  template: TemplateId;
  tone: Tone;
  /** 영상 위에 고정으로 뜨는 짧은 라벨 */
  banner: string;
  cuts: Shot[];
  /** 배경 일러스트를 매번 다르게 그리는 무작위 값 */
  seed?: number;
  source: 'local' | 'ai';
  updatedAt: number;
}

export interface Palette {
  from: string;
  to: string;
  accent: string;
}
