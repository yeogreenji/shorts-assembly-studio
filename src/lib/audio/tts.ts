import type { VoiceId } from '../../types';

/**
 * 나레이션 음성 — 서버(/api/tts)가 만든 한국어 음성을 브라우저에서 AudioBuffer로 풀어 씁니다.
 *
 *  · 한 번에 한 '호흡 블록'(2~4컷을 이어 붙인 문장)을 요청합니다 → 문장이 뚝뚝 끊기지 않습니다
 *  · 서버는 Google 번역 음성을 기본으로 쓰고, OPENAI_API_KEY·ELEVENLABS_API_KEY가 있으면
 *    더 자연스러운 음성을 자동으로 고릅니다(provider=auto). 없으면 그대로 Google로 돕니다.
 *  · 서버가 아예 없으면(정적 호스팅) 브라우저 음성으로 미리보기만 이어 갑니다 — 영상에는 안 들어감
 */

export const TTS_ENDPOINT = '/api/tts';
const CACHE_KEY = 'shortcut-studio:tts-cache:v2';
const CLIENT_CACHE_LIMIT = 48;

export interface VoicePreset {
  id: VoiceId;
  label: string;
  hint: string;
  /** 재생 배속 — 피치도 함께 올라 숏폼 특유의 톤이 됩니다 */
  rate: number;
  /** 낮은 톤용 저역 보강(dB) */
  lowShelf?: number;
  /** 낮은 톤용 고역 정리(Hz) */
  lowpass?: number;
  /** 음성에 더하는 온기(중저역, dB) — 로봇 같은 건조함을 줄입니다 */
  warmth: number;
  /** 무료 플랜에서 쓸 수 있는지 */
  free: boolean;
}

export const VOICES: VoicePreset[] = [
  {
    id: 'clear',
    label: '또렷한 기본',
    hint: '정보 전달형 · 자막을 정확히 읽는 톤',
    rate: 1,
    warmth: 1,
    free: true,
  },
  {
    id: 'fast',
    label: '빠른 숏폼',
    hint: '쇼츠 리듬 · 조금 빠르고 경쾌하게',
    rate: 1.1,
    warmth: 0.6,
    free: true,
  },
  {
    id: 'calm',
    label: '차분한 나레이션',
    hint: '브이로그 · 낮고 느린 톤',
    rate: 0.93,
    lowpass: 8200,
    warmth: 1.8,
    free: false,
  },
  {
    id: 'low',
    label: '낮은 남성 톤',
    hint: '드라마 예고 · 한 옥타브 아래 느낌',
    rate: 0.86,
    lowShelf: 4.5,
    lowpass: 6000,
    warmth: 2.4,
    free: false,
  },
];

export const VOICE_MAP: Record<VoiceId, VoicePreset> = VOICES.reduce(
  (map, preset) => ({ ...map, [preset.id]: preset }),
  {} as Record<VoiceId, VoicePreset>,
);

export function voiceOf(id: VoiceId | undefined): VoicePreset {
  return (id && VOICE_MAP[id]) || VOICE_MAP.clear;
}

/* ── 상태 ──────────────────────────────────────────────── */

export type ClipStatus = 'idle' | 'loading' | 'ready' | 'error';
export type NarrationSource = 'server' | 'speech' | 'none';

export interface Clip {
  status: ClipStatus;
  buffer?: AudioBuffer;
  /** 원래 음성 길이(초) — 배속 전 */
  seconds: number;
  error?: string;
  /** 어떤 엔진이 만든 음성인지(서버가 알려 줌) */
  engine?: string;
}

const clips = new Map<string, Clip>();
const listeners = new Set<() => void>();
let version = 0;
let serverState: 'probing' | 'ready' | 'unavailable' = 'probing';
let decodeCtx: AudioContext | null = null;

let lastError = '';
let engineUsed = '';

export interface TtsStatus {
  reachable: boolean;
  defaultEngine: string;
  engines: { google: boolean; openai: boolean; elevenlabs: boolean };
  maxChars: number;
}

let ttsStatus: TtsStatus | null = null;
let probeTask: Promise<TtsStatus> | null = null;

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeNarration(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function narrationVersion(): number {
  return version;
}

function normalize(text: string): string {
  return text.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
}

export function clipKey(text: string, voice: VoiceId): string {
  return `${voice}|${normalize(text)}`;
}

/** 화면에 보여 줄 상태 이름 — 서버가 없어 브라우저 음성으로 대신 읽는 경우는 '실패'가 아닙니다. */
export function clipLabel(clip: Clip): string {
  if (clip.status === 'ready') return `${clip.seconds.toFixed(1)}s`;
  if (clip.status === 'loading') return '생성 중';
  if (clip.status === 'error') return narrationSource() === 'speech' ? '브라우저' : '실패';
  return '대기';
}

export function getClip(text: string, voice: VoiceId): Clip {
  return clips.get(clipKey(text, voice)) ?? { status: 'idle', seconds: 0 };
}

export function serverTtsState(): 'probing' | 'ready' | 'unavailable' {
  return serverState;
}

export function ttsServerStatus(): TtsStatus | null {
  return ttsStatus;
}

export function lastTtsEngine(): string {
  return engineUsed || ttsStatus?.defaultEngine || '';
}

/** 브라우저 음성(Web Speech)만 쓸 수 있는 상황인지 — 서버가 없을 때의 미리보기 폴백. */
export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined';
}

export function narrationSource(): NarrationSource {
  if (serverState === 'ready') return 'server';
  if (isSpeechSupported()) return 'speech';
  return 'none';
}

/* ── 서버 상태 ─────────────────────────────────────────── */

/** GET /api/tts — 어떤 음성 엔진을 쓸 수 있는지 한 번만 물어봅니다. */
export function probeTts(timeoutMs = 4000): Promise<TtsStatus> {
  if (ttsStatus) return Promise.resolve(ttsStatus);
  if (probeTask) return probeTask;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  probeTask = fetch(TTS_ENDPOINT, { headers: { accept: 'application/json' }, cache: 'no-store', signal: controller.signal })
    .then(async (response) => {
      const text = await response.text();
      let payload: {
        ok?: boolean;
        provider?: string;
        engines?: { google?: boolean; openai?: boolean; elevenlabs?: boolean };
        maxChars?: number;
      } | null = null;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
      if (!response.ok || !payload?.ok) {
        serverState = 'unavailable';
        const fallback: TtsStatus = { reachable: false, defaultEngine: '', engines: { google: false, openai: false, elevenlabs: false }, maxChars: 190 };
        ttsStatus = fallback;
        emit();
        return fallback;
      }
      const status: TtsStatus = {
        reachable: true,
        defaultEngine: payload.provider ?? 'google-translate',
        engines: {
          google: payload.engines?.google !== false,
          openai: Boolean(payload.engines?.openai),
          elevenlabs: Boolean(payload.engines?.elevenlabs),
        },
        maxChars: payload.maxChars ?? 190,
      };
      ttsStatus = status;
      const anyEngine = status.engines.google || status.engines.openai || status.engines.elevenlabs;
      serverState = anyEngine ? 'ready' : 'unavailable';
      emit();
      return status;
    })
    .catch(() => {
      serverState = 'unavailable';
      const fallback: TtsStatus = { reachable: false, defaultEngine: '', engines: { google: false, openai: false, elevenlabs: false }, maxChars: 190 };
      ttsStatus = fallback;
      emit();
      return fallback;
    })
    .finally(() => {
      clearTimeout(timer);
      probeTask = null;
    });
  return probeTask;
}

/* ── 디코드 ────────────────────────────────────────────── */

function decoder(): AudioContext | null {
  if (decodeCtx) return decodeCtx;
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    decodeCtx = new Ctor();
  } catch {
    decodeCtx = null;
  }
  return decodeCtx;
}

async function decode(data: ArrayBuffer): Promise<AudioBuffer | null> {
  const ctx = decoder();
  if (!ctx) return null;
  try {
    return await ctx.decodeAudioData(data.slice(0));
  } catch {
    return null;
  }
}

/* ── 로컬 캐시(IndexedDB 대신 base64) ──────────────────── */

type CacheMap = Record<string, string>;

function readCache(): CacheMap {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CacheMap) : {};
  } catch {
    return {};
  }
}

function writeCache(map: CacheMap) {
  try {
    const keys = Object.keys(map);
    const trimmed: CacheMap = {};
    for (const key of keys.slice(-CLIENT_CACHE_LIMIT)) trimmed[key] = map[key] as string;
    localStorage.setItem(CACHE_KEY, JSON.stringify(trimmed));
  } catch {
    /* 저장 공간이 없는 브라우저 — 캐시 없이 계속 */
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const step = 0x8000;
  for (let index = 0; index < bytes.length; index += step) {
    binary += String.fromCharCode(...bytes.subarray(index, index + step));
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/* ── 생성 ──────────────────────────────────────────────── */

/** 서버에 함께 보낼 화자 스타일 — OpenAI TTS는 이 값으로 말투 지시를 넣습니다. */
let requestStyle = 'story';

export function setTtsStyle(style: string): void {
  if (style) requestStyle = style;
}

async function requestAudio(text: string, voice: VoiceId): Promise<ArrayBuffer | null> {
  const query = new URLSearchParams({ text, voice, provider: 'auto', style: requestStyle });
  const url = `${TTS_ENDPOINT}?${query.toString()}`;
  try {
    const response = await fetch(url, { headers: { accept: 'audio/*' } });
    if (!response.ok) {
      // 서버가 아예 없거나(정적 호스팅) 기능이 꺼져 있을 때만 '음성 없음'으로 확정합니다.
      // 429·502 같은 일시적 실패는 다시 시도할 수 있게 그대로 둡니다.
      if ([404, 405, 501].includes(response.status) && serverState !== 'ready') {
        serverState = 'unavailable';
      }
      lastError = `HTTP ${response.status}`;
      emit();
      return null;
    }
    const type = response.headers.get('content-type') ?? '';
    if (type.includes('application/json')) {
      serverState = 'unavailable';
      emit();
      return null;
    }
    serverState = 'ready';
    engineUsed = response.headers.get('x-tts-provider') ?? engineUsed;
    return await response.arrayBuffer();
  } catch {
    serverState = 'unavailable';
    return null;
  }
}

/** 한 문장(또는 호흡 블록)의 음성을 확보합니다(이미 있으면 그대로). */
export async function loadClip(text: string, voice: VoiceId): Promise<Clip> {
  const clean = normalize(text);
  if (!clean) {
    const empty: Clip = { status: 'error', seconds: 0, error: '읽을 문장이 없습니다.' };
    clips.set(clipKey(text, voice), empty);
    return empty;
  }
  const key = clipKey(clean, voice);
  const existing = clips.get(key);
  if (existing && (existing.status === 'ready' || existing.status === 'loading')) return existing;

  const pending: Clip = { status: 'loading', seconds: 0 };
  clips.set(key, pending);
  emit();

  if (!ttsStatus) await probeTts();

  const cache = readCache();
  const cached = cache[key];
  let buffer: AudioBuffer | null = null;
  if (cached) {
    buffer = await decode(fromBase64(cached).buffer as ArrayBuffer);
  }
  if (!buffer) {
    const data = await requestAudio(clean, voice);
    if (data) {
      buffer = await decode(data);
      if (buffer) {
        cache[key] = toBase64(new Uint8Array(data));
        writeCache(cache);
      }
    }
  }

  const clip: Clip = buffer
    ? { status: 'ready', buffer, seconds: buffer.duration, engine: engineUsed }
    : {
        status: 'error',
        seconds: 0,
        error: serverState === 'unavailable' ? '서버 음성 없음' : `음성을 만들지 못했습니다${lastError ? ` (${lastError})` : ''}.`,
      };
  clips.set(key, clip);
  emit();
  return clip;
}

/** 여러 문장을 한 번에 — 이미 있는 문장은 건너뜁니다. */
export async function loadClips(texts: string[], voice: VoiceId): Promise<Clip[]> {
  return Promise.all(texts.map((text) => loadClip(text, voice)));
}

/** 같은 말이면 다시 받지 않도록 한 번만 요청합니다. */
const inflight = new Map<string, Promise<Clip>>();
export function ensureClip(text: string, voice: VoiceId): Promise<Clip> {
  const key = clipKey(text, voice);
  const existing = clips.get(key);
  if (existing && existing.status === 'ready') return Promise.resolve(existing);
  const running = inflight.get(key);
  if (running) return running;
  const task = loadClip(text, voice).finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

export function resetNarration(): void {
  clips.clear();
  version += 1;
  emit();
}

/* ── 브라우저 음성 폴백(미리보기 전용) ─────────────────── */

function koreanVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((voice) => voice.lang.toLowerCase().startsWith('ko') && /female|여성|sunhi|yuna|google/i.test(voice.name)) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith('ko')) ??
    null
  );
}

const speechEnds = new Set<() => void>();

export function speakFallback(
  text: string,
  options: { rate?: number; pitch?: number; onEnd?: () => void } = {},
): boolean {
  const clean = text.trim();
  if (!isSpeechSupported() || !clean) return false;
  const utterance = new SpeechSynthesisUtterance(clean);
  const voice = koreanVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = 'ko-KR';
  utterance.rate = Math.max(0.5, Math.min(2, options.rate ?? 1.04));
  utterance.pitch = Math.max(0.5, Math.min(1.6, options.pitch ?? 1));
  const done = () => {
    if (options.onEnd) options.onEnd();
  };
  speechEnds.add(done);
  utterance.onend = done;
  utterance.onerror = done;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopFallbackSpeech(): void {
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
  for (const done of speechEnds) done();
  speechEnds.clear();
}

/** 음성 길이(배속 반영) — 컷 길이 추천에도 씁니다. */
export function spokenSeconds(clip: Clip, preset: VoicePreset, rate = 1): number {
  if (!clip.buffer) return 0;
  return clip.buffer.duration / Math.max(0.5, preset.rate * rate);
}
