/**
 * ShortCut Studio — 나레이션 음성 백엔드 (Vercel Serverless Function)
 *
 * GET  /api/tts                서버 상태 JSON (앱이 '서버 음성 / 브라우저 음성' 배지를 고를 때)
 * GET  /api/tts?text=...       한국어 음성 → audio/mpeg (MP3 바이트)
 *
 * 음성은 Google Translate TTS(무료, 키 없음)에서 받아 그대로 흘려보냅니다.
 * 긴 문장은 170자 이하로 끊어 요청하고, 받은 조각을 이어 붙여 한 파일로 돌려줍니다.
 * 키도, 개인정보도 저장하지 않으며 문장 자체는 인스턴스 메모리에만 잠깐 캐시됩니다.
 *
 * 실패(레이트리밋·차단·네트워크)하면 502 tts_unavailable — 앱은 그때 브라우저 음성으로 넘어갑니다.
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
const VERSION = '1.0.0';
/** 한 번에 요청할 수 있는 글자 수 — Google TTS가 200자 근처에서 잘립니다. */
const MAX_CHARS = 190;
const CHUNK_CHARS = 170;
/** 인스턴스가 1분에 처리할 최대 요청 수 — 무료 엔드포인트를 두들겨 차단당하지 않게. */
const RATE_LIMIT = 60;
const CACHE_LIMIT = 240;
const UPSTREAM_TIMEOUT_MS = 7_000;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
};

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/** 최근에 만든 음성 — 같은 자막을 미리보기·내보내기가 다시 부를 때 바로 응답합니다. */
const cache = new Map<string, Uint8Array>();
let rateWindowStart = 0;
let rateCount = 0;

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

function bytes(res: ApiResponse, audio: Uint8Array, cacheSeconds: number) {
  for (const [name, value] of Object.entries({
    'Content-Type': 'audio/mpeg',
    'Content-Length': String(audio.byteLength),
    'Cache-Control': `public, max-age=${cacheSeconds}, immutable`,
    'X-TTS-Provider': 'google-translate',
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

function remember(key: string, audio: Uint8Array) {
  cache.set(key, audio);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function fetchChunk(text: string, index: number, total: number): Promise<Uint8Array | null> {
  const url = new URL('https://translate.google.com/translate_tts');
  url.searchParams.set('ie', 'UTF-8');
  url.searchParams.set('q', text);
  url.searchParams.set('tl', 'ko');
  url.searchParams.set('client', 'tw-ob');
  url.searchParams.set('total', String(total));
  url.searchParams.set('idx', String(index));
  url.searchParams.set('textlen', String(text.length));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url.toString(), {
      headers: {
        'user-agent': UA,
        referer: 'https://translate.google.com/',
        accept: '*/*',
        'accept-language': 'ko-KR,ko;q=0.9,en;q=0.6',
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? '';
    if (type && !/audio|mpeg|octet-stream/i.test(type)) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    return buffer.byteLength > 400 ? buffer : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function synthesize(text: string): Promise<Uint8Array | null> {
  const cached = cache.get(text);
  if (cached) return cached;
  const chunks = splitChunks(text);
  const parts: Uint8Array[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const part = await fetchChunk(chunks[index] as string, index, chunks.length);
    if (!part) return null;
    parts.push(part);
  }
  // 조각을 이어 붙일 때 MP3 프레임은 그대로 이어도 디코더가 이어서 읽습니다.
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  remember(text, merged);
  return merged;
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
  const hasTextParam = url.searchParams.has('text');
  const rawText = (url.searchParams.get('text') ?? '').slice(0, 900);
  if (!hasTextParam) {
    json(res, 200, {
      ok: true,
      service: SERVICE,
      version: VERSION,
      provider: 'google-translate',
      lang: 'ko',
      maxChars: MAX_CHARS,
      chunkChars: CHUNK_CHARS,
      cached: cache.size,
      note: 'text 파라미터를 붙이면 한국어 나레이션 MP3를 돌려줍니다.',
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
      error: { code: 'too_long', message: `한 번에 ${MAX_CHARS}자까지 읽습니다. 컷 자막을 나눠 주세요.` },
    });
    return;
  }
  if (!allowed()) {
    json(res, 429, { ok: false, error: { code: 'rate_limited', message: '음성 요청이 잠시 많습니다. 조금 뒤 다시 시도해 주세요.' } });
    return;
  }

  const audio = await synthesize(text);
  if (!audio) {
    json(res, 502, {
      ok: false,
      error: { code: 'tts_unavailable', message: '음성 서버가 응답하지 않습니다. 브라우저 음성으로 이어서 재생할 수 있습니다.' },
    });
    return;
  }
  bytes(res, audio, 86_400);
}
