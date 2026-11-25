/**
 * ShortCut Studio — 나레이션 음성 백엔드 (Vercel Serverless Function)
 *
 * GET  /api/tts                 서버 상태 JSON (앱이 '서버 음성 / 브라우저 음성' 배지를 고를 때)
 * GET  /api/tts?text=...        한국어 음성 → audio/mpeg (MP3 바이트)
 *
 * 음성 엔진 (provider=auto면 위에서부터 쓸 수 있는 것)
 *   1) OpenAI TTS        — OPENAI_API_KEY가 있으면. 가장 자연스러운 한국어 음성
 *   2) ElevenLabs        — ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID가 있으면(선택)
 *   3) Google Translate  — 키 없이 무료. 항상 동작하는 기본 엔진
 *
 * 긴 문장은 Google에서만 170자 이하로 끊어 요청하고, 받은 조각을 이어 붙여 한 파일로 돌려줍니다.
 * 키도, 개인정보도 저장하지 않으며 문장 자체는 인스턴스 메모리에만 잠깐 캐시됩니다.
 * 실패하면 502 tts_unavailable — 앱은 그때 브라우저 음성으로 넘어갑니다.
 */

type HeaderValue = string | string[] | undefined;

interface ApiRequest {
  method?: string;
  url?: string;
  headers: Record<string, HeaderValue>;
  body?: unknown;
  on?: (event: string, listener: (chunk: unknown) => void) => void;
}

interface ApiResponse {
  statusCode: number;
  setHeader: (name: string, value: string | string[]) => void;
  end: (body?: string | Uint8Array) => void;
}

const SERVICE = 'shortcut-tts';
const VERSION = '1.1.0';
/** 한 번에 요청할 수 있는 글자 수 — Google TTS가 200자 근처에서 잘립니다. */
const MAX_CHARS = 900;
const CHUNK_CHARS = 170;
/** 인스턴스가 1분에 처리할 최대 요청 수 — 무료 엔드포인트를 두들겨 차단당하지 않게. */
const RATE_LIMIT = 60;
const CACHE_LIMIT = 240;
const UPSTREAM_TIMEOUT_MS = 9_000;

type Provider = 'google' | 'openai' | 'elevenlabs';
type VoiceKey = 'clear' | 'fast' | 'calm' | 'low';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** 앱의 보이스 프리셋 → 제공자별 목소리 이름 */
const OPENAI_VOICES: Record<VoiceKey, string> = {
  clear: 'nova',
  fast: 'shimmer',
  calm: 'alloy',
  low: 'onyx',
};

const OPENAI_STYLE: Record<string, string> = {
  story: 'Calm Korean storyteller. Speak naturally with gentle pauses, like telling a story to a friend.',
  anchor: 'Korean news anchor. Clear, steady delivery with crisp consonants and confident pacing.',
  friendly: 'Friendly Korean YouTuber. Warm, upbeat, conversational pacing with light energy.',
  drama: 'Korean drama trailer narrator. Low, slow, tense delivery with dramatic pauses.',
};

/** 최근에 만든 음성 — 같은 자막을 미리보기·내보내기가 다시 부를 때 바로 응답합니다. */
const cache = new Map<string, { audio: Uint8Array; provider: Provider }>();
let rateWindowStart = 0;
let rateCount = 0;

const env = (): Record<string, string | undefined> =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

function json(res: ApiResponse, status: number, payload: unknown) {
  for (const [name, value] of Object.entries({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...CORS,
  })) {
    res.setHeader(name, value);
  }
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

function bytes(res: ApiResponse, audio: Uint8Array, cacheSeconds: number, provider: Provider) {
  for (const [name, value] of Object.entries({
    'Content-Type': 'audio/mpeg',
    'Content-Length': String(audio.byteLength),
    'Cache-Control': `public, max-age=${cacheSeconds}, immutable`,
    'X-TTS-Provider': provider,
    'X-TTS-Service': `${SERVICE}/${VERSION}`,
    ...CORS,
  })) {
    res.setHeader(name, value);
  }
  res.statusCode = 200;
  res.end(audio);
}

/** 자막에 남을 수 있는 표기(*강조*, 이모지, 따옴표)를 음성용 문장으로 다듬습니다. */
function cleanText(input: string): string {
  return input
    .replace(/\*/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
    .replace(/[「」『』“”"`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 170자 이하 조각으로 — 문장 끝(.!?…다)을 우선, 없으면 띄어쓰기에서 끊습니다. */
function splitChunks(text: string): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > CHUNK_CHARS) {
    const head = rest.slice(0, CHUNK_CHARS);
    let cut = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '), head.lastIndexOf('다 '));
    if (cut > 40) cut += 1;
    else cut = head.lastIndexOf(' ');
    if (cut < 30) cut = CHUNK_CHARS;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks.filter(Boolean);
}

function allowed(): boolean {
  const now = Date.now();
  if (now - rateWindowStart > 60_000) {
    rateWindowStart = now;
    rateCount = 0;
  }
  rateCount += 1;
  return rateCount <= RATE_LIMIT;
}

function remember(key: string, audio: Uint8Array, provider: Provider) {
  cache.set(key, { audio, provider });
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ── Google 번역 TTS (키 없이 무료) ────────────────────── */

async function fetchGoogleChunk(text: string, index: number, total: number): Promise<Uint8Array | null> {
  const url = new URL('https://translate.google.com/translate_tts');
  url.searchParams.set('ie', 'UTF-8');
  url.searchParams.set('q', text);
  url.searchParams.set('tl', 'ko');
  url.searchParams.set('client', 'tw-ob');
  url.searchParams.set('total', String(total));
  url.searchParams.set('idx', String(index));
  url.searchParams.set('textlen', String(text.length));
  try {
    const response = await fetchWithTimeout(url.toString(), {
      headers: {
        'user-agent': UA,
        referer: 'https://translate.google.com/',
        accept: '*/*',
        'accept-language': 'ko-KR,ko;q=0.9,en;q=0.6',
      },
    });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? '';
    if (type && !/audio|mpeg|octet-stream/i.test(type)) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    return buffer.byteLength > 400 ? buffer : null;
  } catch {
    return null;
  }
}

async function synthesizeGoogle(text: string): Promise<Uint8Array | null> {
  const chunks = splitChunks(text);
  const parts: Uint8Array[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const part = await fetchGoogleChunk(chunks[index] as string, index, chunks.length);
    if (!part) return null;
    parts.push(part);
  }
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  return merged;
}

/* ── OpenAI TTS (키가 있을 때) ─────────────────────────── */

async function synthesizeOpenAI(text: string, voice: VoiceKey, style: string): Promise<Uint8Array | null> {
  const key = env().OPENAI_API_KEY?.trim();
  if (!key) return null;
  const model = env().OPENAI_TTS_MODEL?.trim() || 'gpt-4o-mini-tts';
  const base = (env().OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  try {
    const response = await fetchWithTimeout(`${base}/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        voice: OPENAI_VOICES[voice] ?? OPENAI_VOICES.clear,
        input: text,
        response_format: 'mp3',
        speed: 1,
        ...(model === 'gpt-4o-mini-tts' || model.startsWith('gpt-4o')
          ? { instructions: OPENAI_STYLE[style] ?? OPENAI_STYLE.story }
          : {}),
      }),
    });
    if (!response.ok) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    return buffer.byteLength > 400 ? buffer : null;
  } catch {
    return null;
  }
}

/* ── ElevenLabs (키+보이스가 있을 때) ──────────────────── */

async function synthesizeElevenLabs(text: string, style: string): Promise<Uint8Array | null> {
  const key = env().ELEVENLABS_API_KEY?.trim();
  const voiceId = env().ELEVENLABS_VOICE_ID?.trim();
  if (!key || !voiceId) return null;
  try {
    const response = await fetchWithTimeout(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': key },
        body: JSON.stringify({
          text,
          model_id: env().ELEVENLABS_MODEL?.trim() || 'eleven_multilingual_v2',
          voice_settings: { stability: 0.45, similarity_boost: 0.75, style: style === 'drama' ? 0.55 : 0.3 },
        }),
      },
    );
    if (!response.ok) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    return buffer.byteLength > 400 ? buffer : null;
  } catch {
    return null;
  }
}

/* ── 엔진 선택 ─────────────────────────────────────────── */

function engines(): Record<Provider, boolean> {
  const e = env();
  return {
    google: true,
    openai: Boolean(e.OPENAI_API_KEY?.trim()),
    elevenlabs: Boolean(e.ELEVENLABS_API_KEY?.trim() && e.ELEVENLABS_VOICE_ID?.trim()),
  };
}

function pickProvider(requested: string): Provider | null {
  const available = engines();
  if (requested === 'google' || requested === 'openai' || requested === 'elevenlabs') {
    return available[requested] ? requested : null;
  }
  if (available.openai) return 'openai';
  if (available.elevenlabs) return 'elevenlabs';
  return available.google ? 'google' : null;
}

function isVoice(value: string): value is VoiceKey {
  return value === 'clear' || value === 'fast' || value === 'calm' || value === 'low';
}

async function synthesize(text: string, provider: Provider, voice: VoiceKey, style: string): Promise<Uint8Array | null> {
  const key = `${provider}|${voice}|${style}|${text}`;
  const cached = cache.get(key);
  if (cached) return cached.audio;
  let audio: Uint8Array | null = null;
  if (provider === 'openai') audio = await synthesizeOpenAI(text, voice, style);
  else if (provider === 'elevenlabs') audio = await synthesizeElevenLabs(text, style);
  else audio = await synthesizeGoogle(text);
  if (audio) remember(key, audio, provider);
  return audio;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    for (const [name, value] of Object.entries(CORS)) res.setHeader(name, value);
    res.statusCode = 204;
    res.end('');
    return;
  }
  if (method !== 'GET') {
    json(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'GET만 지원합니다.' } });
    return;
  }

  const url = new URL(req.url ?? '/api/tts', 'http://localhost');
  const available = engines();
  const defaultProvider = available.openai ? 'openai' : available.elevenlabs ? 'elevenlabs' : 'google';
  const hasTextParam = url.searchParams.has('text');
  const rawText = (url.searchParams.get('text') ?? '').slice(0, 1_200);
  if (!hasTextParam) {
    json(res, 200, {
      ok: true,
      service: SERVICE,
      version: VERSION,
      provider: defaultProvider,
      engines: available,
      lang: 'ko',
      maxChars: MAX_CHARS,
      chunkChars: CHUNK_CHARS,
      cached: cache.size,
      note: 'text 파라미터를 붙이면 한국어 나레이션 MP3를 돌려줍니다. provider=auto|google|openai|elevenlabs',
    });
    return;
  }

  const text = cleanText(rawText);
  if (!text) {
    json(res, 400, { ok: false, error: { code: 'empty_text', message: '읽을 문장이 없습니다.' } });
    return;
  }
  if (text.length > MAX_CHARS) {
    json(res, 413, {
      ok: false,
      error: { code: 'too_long', message: `한 번에 ${MAX_CHARS}자까지 읽습니다. 나레이션을 나눠 주세요.` },
    });
    return;
  }

  const requested = (url.searchParams.get('provider') ?? 'auto').toLowerCase();
  const provider = pickProvider(requested);
  if (!provider) {
    json(res, 501, {
      ok: false,
      error: {
        code: 'no_provider',
        message:
          requested === 'auto'
            ? '서버에 쓸 수 있는 음성 엔진이 없습니다.'
            : `${requested} 음성 키가 서버에 없습니다. provider=auto로 두면 무료 음성으로 읽습니다.`,
      },
    });
    return;
  }

  if (!allowed()) {
    json(res, 429, { ok: false, error: { code: 'rate_limited', message: '음성 요청이 잠시 많습니다. 조금 뒤 다시 시도해 주세요.' } });
    return;
  }

  const voiceParam = (url.searchParams.get('voice') ?? 'clear').toLowerCase();
  const voice: VoiceKey = isVoice(voiceParam) ? voiceParam : 'clear';
  const style = (url.searchParams.get('style') ?? 'story').toLowerCase();

  const audio = await synthesize(text, provider, voice, style);
  if (!audio) {
    json(res, 502, {
      ok: false,
      error: { code: 'tts_unavailable', message: '음성 서버가 응답하지 않습니다. 브라우저 음성으로 이어서 재생할 수 있습니다.' },
    });
    return;
  }
  bytes(res, audio, 86_400, provider);
}
