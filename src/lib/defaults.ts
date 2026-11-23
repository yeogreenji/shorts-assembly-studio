import type { AudioSettings, BrandSettings, CaptionStyle, Shorts, TemplateId } from '../types';

/** 새 프로젝트의 기본값 — 저장된 옛 프로젝트도 이 값으로 채워 열립니다. */

export const DEFAULT_AUDIO: AudioSettings = {
  mood: 'trendy',
  volume: 0.45,
  muted: false,
  accents: true,
  narration: true,
  voice: 'clear',
  voiceRate: 1,
  voiceVolume: 0.9,
  ducking: true,
};

export const DEFAULT_STYLE: CaptionStyle = {
  theme: 'impact',
  position: 'bottom',
  size: 'm',
};

export const DEFAULT_BRAND: BrandSettings = {
  enabled: false,
  handle: '',
  corner: 'bottom-right',
};

/** 템플릿을 고르면 어울리는 배경음이 함께 따라옵니다(사용자가 바꾸면 그대로 둡니다). */
export const BGM_BY_TEMPLATE: Record<TemplateId, AudioSettings['mood']> = {
  balance: 'trendy',
  living: 'trendy',
  love: 'romance',
  review: 'comic',
  it: 'trendy',
  issue: 'tension',
};

/** 저장 파일·URL에서 읽은 값이 비어 있어도 화면이 깨지지 않게 채웁니다. */
export function withDefaults(shorts: Shorts): Shorts {
  return {
    ...shorts,
    audio: { ...DEFAULT_AUDIO, ...(shorts.audio ?? {}) },
    style: { ...DEFAULT_STYLE, ...(shorts.style ?? {}) },
    brand: { ...DEFAULT_BRAND, ...(shorts.brand ?? {}) },
  };
}

export function audioOf(shorts: Shorts): AudioSettings {
  return { ...DEFAULT_AUDIO, ...(shorts.audio ?? {}) };
}

export function styleOf(shorts: Shorts): CaptionStyle {
  return { ...DEFAULT_STYLE, ...(shorts.style ?? {}) };
}

export function brandOf(shorts: Shorts): BrandSettings {
  return { ...DEFAULT_BRAND, ...(shorts.brand ?? {}) };
}
