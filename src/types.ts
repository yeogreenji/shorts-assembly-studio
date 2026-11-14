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

/** 영상(MP4)에 들어가는 AI 목소리 — 브라우저 미리듣기와 별개로 렌더 단계에서 합성합니다. */
export interface AiVoiceStyle {
  engine: 'edge';
  /** edge-tts 음성 id (예: ko-KR-SunHiNeural) */
  voice: string;
  voiceLabel: string;
  /** 속도 보정 % (예: 6 → +6%) */
  ratePct: number;
  /** 음높이 보정 Hz */
  pitchHz: number;
}

/** 영상 상단에 고정으로 박히는 주제 배너 */
export interface BannerStyle {
  enabled: boolean;
  text: string;
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
  banner: BannerStyle;
  voice: VoiceStyle;
  aiVoice: AiVoiceStyle;
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
    banner: { enabled: boolean; text: string };
    voice: {
      name: string;
      lang: string;
      rate: number;
      pitch: number;
      tts: { engine: 'edge'; voice: string; ratePct: number; pitchHz: number };
    };
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
