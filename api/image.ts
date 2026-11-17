/**
 * ShortCut Studio — 컷 배경 이미지 백엔드 (Vercel Serverless Function)
 *
 * GET  /api/image   이미지 생성 가능 여부
 * POST /api/image   { scene, character } → { ok, mime, data(base64) }  9:16 웹툰풍 일러스트 1장
 *
 * GEMINI_API_KEY 필요. 모델은 GEMINI_IMAGE_MODEL(기본 gemini-3.1-flash-image),
 * 모델을 찾을 수 없으면(404) gemini-2.5-flash-image로 한 번 더 시도합니다.
 * 키가 없으면 501 no_key — 앱은 내장 장면 일러스트로 대신합니다.
 */

type HeaderValue = string | string[] | undefined;

interface ApiRequest {
  method?: string;
  headers: Record<string, HeaderValue>;
  body?: unknown;
  on?: (event: string, listener: (chunk: unknown) => void) => void;
}

interface ApiResponse {
  statusCode: number;
  setHeader: (name: string, value: string | string[]) => void;
  end: (body?: string) => void;
}

const DEFAULT_MODEL = 'gemini-3.1-flash-image';
const FALLBACK_MODEL = 'gemini-2.5-flash-image';
const MAX_BODY_CHARS = 4_000;
const MAX_RESPONSE_CHARS = 4_300_000; // Vercel 응답 한도(4.5MB) 안쪽

const STYLE =
  'Korean webtoon illustration, clean confident line art, cel-shaded soft gradients, vivid but harmonious colors, ' +
  'cinematic vertical composition, expressive faces, detailed background, dramatic lighting. ' +
  'Absolutely no text, no letters, no numbers, no logos, no watermark, no speech bubbles. ' +
  'Leave the lower third of the frame visually calm, because subtitles will be placed there.';

const env = (): Record<string, string | undefined> =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
};

function send(res: ApiResponse, status: number, payload: unknown) {
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

const fail = (res: ApiResponse, status: number, code: string, message: string) =>
  send(res, status, { ok: false, error: { code, message } });

async function readBody(req: ApiRequest): Promise<Record<string, unknown> | null> {
  let raw = '';
  if (req.body !== undefined && req.body !== null) {
    raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  } else if (typeof req.on === 'function') {
    raw = await new Promise<string>((resolve) => {
      let buf = '';
      req.on?.('data', (chunk) => {
        buf += typeof chunk === 'string' ? chunk : String(chunk);
      });
      req.on?.('end', () => resolve(buf));
      req.on?.('error', () => resolve(''));
    });
  }
  if (!raw.trim() || raw.length > MAX_BODY_CHARS) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (value: unknown, limit: number): string =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').slice(0, limit).trim() : '';

interface GeminiImagePayload {
  candidates?: {
    content?: { parts?: { text?: string; inlineData?: { mimeType?: string; data?: string } }[] };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
}

async function generate(apiKey: string, model: string, prompt: string) {
  const base = (env().GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
  const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '9:16' } },
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      let detail = text.slice(0, 200);
      try {
        detail = (JSON.parse(text) as { error?: { message?: string } }).error?.message?.slice(0, 200) ?? detail;
      } catch {
        /* 원문 유지 */
      }
      throw Object.assign(new Error(detail || `HTTP ${response.status}`), { status: response.status });
    }
    const payload = JSON.parse(text) as GeminiImagePayload;
    const part = (payload.candidates?.[0]?.content?.parts ?? []).find((p) => p.inlineData?.data);
    if (!part?.inlineData?.data) {
      const reason = payload.promptFeedback?.blockReason ?? payload.candidates?.[0]?.finishReason;
      throw Object.assign(new Error(reason ? `이미지가 만들어지지 않았습니다 (${reason})` : '이미지 응답이 비었습니다'), {
        status: 502,
      });
    }
    return { mime: part.inlineData.mimeType || 'image/png', data: part.inlineData.data };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    for (const [name, value] of Object.entries(CORS)) res.setHeader(name, value);
    res.statusCode = 204;
    res.end();
    return;
  }

  const apiKey = env().GEMINI_API_KEY?.trim() ?? '';
  const model = env().GEMINI_IMAGE_MODEL?.trim() || DEFAULT_MODEL;

  if (method === 'GET') {
    send(res, 200, { ok: true, service: 'shortcut-image', image: Boolean(apiKey), model: apiKey ? model : null });
    return;
  }
  if (method !== 'POST') {
    fail(res, 405, 'method_not_allowed', 'GET 또는 POST만 지원합니다.');
    return;
  }
  if (!apiKey) {
    fail(res, 501, 'no_key', '서버에 GEMINI_API_KEY가 없어 이미지를 만들 수 없습니다.');
    return;
  }

  const body = await readBody(req);
  const scene = str(body?.scene, 280);
  if (!body || scene.length < 8) {
    fail(res, 400, 'bad_scene', '장면 묘사가 필요합니다.');
    return;
  }
  const character = str(body.character, 220);
  const prompt = [
    `Vertical 9:16 illustration for a short video.`,
    character ? `Main character (keep identical across shots): ${character}.` : '',
    `Scene: ${scene}`,
    `Style: ${STYLE}`,
  ]
    .filter(Boolean)
    .join('\n');

  try {
    let result;
    try {
      result = await generate(apiKey, model, prompt);
    } catch (error) {
      if ((error as { status?: number }).status === 404 && model !== FALLBACK_MODEL) {
        result = await generate(apiKey, FALLBACK_MODEL, prompt);
      } else {
        throw error;
      }
    }
    if (result.data.length > MAX_RESPONSE_CHARS) {
      fail(res, 502, 'too_large', '생성된 이미지가 너무 커서 전달할 수 없습니다.');
      return;
    }
    send(res, 200, { ok: true, mime: result.mime, data: result.data });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 502;
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    fail(res, status === 401 || status === 403 ? 502 : status, status === 401 || status === 403 ? 'provider_auth' : 'upstream', message.slice(0, 200));
  }
}
