export type SubtitlePosition = 'top' | 'middle' | 'bottom';
export type BgmMood = 'calm' | 'upbeat' | 'tense' | 'playful' | 'none';
export type ThemeId = 'sunset' | 'night' | 'mint' | 'mono' | 'candy';
export type CutRole = 'hook' | 'body' | 'cta';

export interface Theme {
  id: ThemeId;
  name: string;
  from: string;
  to: string;
  accent: string;
  text: string;
}

export interface MediaAsset {
  name: string;
  dataUrl: string;
}

export interface Cut {
  id: string;
  role: CutRole;
  /** 썸네일 카피 — 화면 상단에 크게 박히는 문장 */
  headline: string;
  /** 자막 — 화면 하단에 떠오르는 문장. *별표*로 감싼 단어는 강조색 */
  subtitle: string;
  /** 나레이션 — TTS가 읽는 문장 (자막과 다를 수 있음) */
  narration: string;
  duration: number;
  theme: ThemeId;
  image: MediaAsset | null;
  audio: MediaAsset | null;
}

export interface SubtitleStyle {
  position: SubtitlePosition;
  sizePx: number;
  color: string;
  highlight: string;
  outline: number;
}

export interface HeadlineStyle {
  enabled: boolean;
  sizePx: number;
}

export interface VoiceStyle {
  voiceURI: string;
  voiceName: string;
  lang: string;
  rate: number;
  pitch: number;
  volume: number;
}

export interface BgmStyle {
  mood: BgmMood;
  volume: number;
}

export interface Project {
  id: string;
  title: string;
  topic: string;
  cuts: Cut[];
  subtitle: SubtitleStyle;
  headline: HeadlineStyle;
  voice: VoiceStyle;
  bgm: BgmStyle;
  updatedAt: number;
}

/** 하단 렌더 파이프라인(scripts/render_shorts.py)이 그대로 읽는 페이로드 */
export interface RenderPayload {
  version: 1;
  project: { title: string };
  canvas: { width: number; height: number; fps: number };
  style: {
    subtitle: {
      position: SubtitlePosition;
      sizePx: number;
      color: string;
      highlight: string;
      outline: number;
    };
    headline: { enabled: boolean; sizePx: number };
    voice: { name: string; lang: string; rate: number; pitch: number };
    bgm: { mood: BgmMood; volume: number };
  };
  cuts: RenderCut[];
}

export interface RenderCut {
  id: string;
  role: CutRole;
  headline: string;
  subtitle: string;
  narration: string;
  duration: number;
  theme: ThemeId;
  image: MediaAsset | null;
  audio: MediaAsset | null;
}
