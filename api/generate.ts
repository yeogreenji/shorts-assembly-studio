/**
 * ShortCut Studio — AI 대본 백엔드 (Vercel Serverless Function)
 *
 * GET  /api/generate   서버·키 상태 (앱이 'AI 대본 / 내장 엔진' 배지를 고를 때)
 * POST /api/generate   { topic, template, tone } → 6컷 쇼츠 대본 JSON
 *
 * 키 우선순위: GEMINI_API_KEY(기본 모델 gemini-3.5-flash-lite, AQ.·AIza… 키 포함)
 *              → OPENAI_API_KEY(기본 gpt-4o-mini) → 요청 본문 apiKey(앞자리로 제공자 판별)
 * 키가 없으면 501 no_key. 앱은 그때 내장 엔진(src/lib/localEngine.ts)으로 즉시 대본을 만듭니다.
 * 입력과 키는 어디에도 저장하지 않습니다.
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
  end: (body?: string) => void;
}

const SERVICE = 'shortcut-generate';
const VERSION = '1.0.0';
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const TEMPLATES = ['balance', 'living', 'love', 'it'] as const;
const TONES = ['cider', 'empathy', 'humor'] as const;
const MAX_BODY_CHARS = 8_000;

type Template = (typeof TEMPLATES)[number];
type Tone = (typeof TONES)[number];
type Provider = 'gemini' | 'openai';

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

function readStream(req: ApiRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof req.on !== 'function') {
      reject(new Error('no stream'));
      return;
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += typeof chunk === 'string' ? chunk : String(chunk);
    });
    req.on('end', () => resolve(raw));
    req.on('error', () => reject(new Error('stream error')));
  });
}

async function readBody(req: ApiRequest): Promise<Record<string, unknown> | null> {
  let raw: string;
  if (req.body !== undefined && req.body !== null) {
    raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  } else {
    try {
      raw = await readStream(req);
    } catch {
      return null;
    }
  }
  if (!raw.trim()) return {};
  if (raw.length > MAX_BODY_CHARS) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (value: unknown, limit: number): string =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').slice(0, limit).trim() : '';

const TEMPLATE_GUIDE: Record<Template, string> = {
  balance: 'A와 B 중 하나를 고르는 밸런스 게임. 1번(A)의 매력과 함정, 2번(B)의 매력과 함정을 번갈아 보여 주고 댓글 투표로 끝냅니다.',
  living: '혼자 사는 사람에게 바로 쓸모 있는 생활 팁. 팁 두 개를 이유와 함께 보여 주고 저장을 유도합니다.',
  love: '연애·관계에서 실제로 겪는 장면. 공감되는 상황 한 컷과 행동 팁 두 개, 마지막에 경험을 묻습니다.',
  it: '기술·서비스 이야기를 어렵지 않게. 최근 흐름 한 컷과 쓸모 있는 포인트 두 개, 마지막에 저장을 유도합니다.',
};

const TONE_GUIDE: Record<Tone, string> = {
  cider: '사이다 — 군더더기 없이 단호하게. 짧고 시원한 팩트.',
  empathy: '공감 — 내 얘기처럼 다정하게. 옆에서 말 걸듯이.',
  humor: '유머 — 과장과 자기비하로 한 번 비틀기. 웃고 나서 고개 끄덕이게.',
};

const SYSTEM = `[SHORTCUT_SHORTS] 당신은 구독자 100만 한국 숏폼 채널의 메인 작가입니다. 9:16 세로 쇼츠 6컷 대본과, 컷마다 들어갈 웹툰풍 장면 묘사를 씁니다.
규칙을 어기면 결과 전체가 폐기됩니다.

[대본 원칙 — 일기장 말투 금지]
1. 정확히 6컷. 1컷=훅, 2~5컷=본문, 6컷=댓글·저장 유도.
2. 훅은 스크롤을 멈추게 해야 합니다. 정보를 일부러 비워 궁금하게 하거나, 구체적인 상황·숫자·반전으로 시작합니다. "오늘은 ~에 대해 알아볼게요", "~가 중요합니다" 같은 설명체·인사·일기체 금지.
3. 본문 4컷은 한 컷마다 새 정보나 새 장면이 나와야 하고, 뒤로 갈수록 긴장이나 반전이 커집니다. 앞 컷의 말을 바꿔 말하는 반복 금지. 추상어(중요, 좋음, 다양한) 대신 보이는 디테일(시각, 금액 단위, 행동, 물건)을 씁니다.
4. 말투는 친구에게 던지듯 짧은 구어체. 한 컷 한 문장, 12~28자. 문장 끝을 매번 같은 어미로 맞추지 않습니다.
5. 마지막 컷은 "댓글 남겨주세요"가 아니라 편을 가르는 질문이나 도발로 끝냅니다. 예) "너라면 1번? 2번? 댓글로 싸우자".
6. 강조 단어 1~2개를 *별표*로 감쌉니다(짝 필수).
7. 전체 15~20초, duration은 컷당 2.4~3.4(초), 합계 15~20.
8. 확인되지 않은 수치·효능·순위를 지어내지 않습니다. 실존 인물·회사·브랜드·실제 사건 이름 금지.
9. emoji는 컷마다 하나.

[장면 묘사 원칙 — 영상의 그림이 됩니다]
- character: 영어 한 문장. 6컷 내내 같은 주인공 외형(나이대, 머리, 옷, 특징). 예) "a Korean office worker in his late 20s, messy black hair, navy shirt with loosened tie, round glasses"
- 컷마다 scene: 영어 2문장 이내(220자 이내). 구도(close-up/wide/low angle), 주인공 행동과 표정, 배경 소품, 빛을 구체적으로. 그 컷 자막의 상황을 그림으로 보여 줘야 합니다. 화면에 글자·숫자·로고가 보이면 안 되므로 text, signs, logos를 묘사하지 않습니다. 실존 인물·브랜드·캐릭터 금지. 폭력·선정 장면 금지.
- 6컷이 서로 다른 구도·배경이어야 합니다.

[출력] 설명이나 코드블록 없이 JSON 객체 하나만.
{"title":"영상 제목 16자 이내","banner":"상단 라벨 10자 이내","character":"...","cuts":[{"role":"hook","emoji":"🥊","subtitle":"월급 *1.5배* 줄 테니 평생 야근, 콜?","scene":"Close-up of the protagonist staring wide-eyed at a glowing payslip in a dark office, city lights behind him.","duration":2.8}, ...6개]}`;

function buildUserPrompt(topic: string, template: Template, tone: Tone): string {
  return `[주제]
${topic}

[카테고리] ${template}
${TEMPLATE_GUIDE[template]}

[톤] ${tone}
${TONE_GUIDE[tone]}

위 주제로 6컷 쇼츠 대본 JSON을 만드세요. 주제에 없는 사실을 만들어 넣지 마세요.`;
}

interface CompletionInput {
  provider: Provider;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}

interface CompletionResult {
  content: string;
  model: string;
}

function parseJsonContent(content: string): Record<string, unknown> | null {
  const cleaned = content
    .replace(/^\s*```(?:json)?/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  const candidates = [cleaned];
  if (first >= 0 && last > first) candidates.push(cleaned.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

async function callOpenAI(input: CompletionInput): Promise<CompletionResult> {
  const base = (env().OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.85,
        max_tokens: input.maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      let detail = text.slice(0, 160);
      try {
        detail = (JSON.parse(text) as { error?: { message?: string } }).error?.message?.slice(0, 160) ?? detail;
      } catch {
        /* 원문 유지 */
      }
      throw Object.assign(new Error(detail || `HTTP ${response.status}`), { status: response.status });
    }
    const payload = JSON.parse(text) as { choices?: { message?: { content?: string } }[]; model?: string };
    const content = payload.choices?.[0]?.message?.content ?? '';
    if (!content.trim()) throw Object.assign(new Error('빈 응답'), { status: 502 });
    return { content, model: payload.model || input.model };
  } finally {
    clearTimeout(timer);
  }
}

interface GeminiPayload {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  modelVersion?: string;
}

async function callGemini(input: CompletionInput): Promise<CompletionResult> {
  const base = (env().GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
  const url = `${base}/v1beta/models/${encodeURIComponent(input.model)}:generateContent?key=${encodeURIComponent(input.apiKey)}`;
  const generationConfig: Record<string, unknown> = {
    responseMimeType: 'application/json',
    temperature: 0.9,
  };
  if (/^gemini-3\./.test(input.model)) {
    // Gemini 3.x는 thinking 토큰이 maxOutputTokens에 포함됩니다. 잘린 JSON을 받지 않게 넉넉히 잡습니다.
    generationConfig.maxOutputTokens = Math.min(32_768, input.maxTokens * 3 + 1_024);
  } else {
    generationConfig.maxOutputTokens = input.maxTokens;
    if (/^gemini-2\.5-flash(?!-lite)/.test(input.model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.system }] },
        contents: [{ role: 'user', parts: [{ text: input.user }] }],
        generationConfig,
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      let detail = text.slice(0, 160);
      try {
        detail = (JSON.parse(text) as { error?: { message?: string } }).error?.message?.slice(0, 160) ?? detail;
      } catch {
        /* 원문 유지 */
      }
      const unavailable = response.status === 404;
      const status = unavailable ? 502 : response.status === 400 || response.status === 401 || response.status === 403 ? 401 : response.status;
      const message = unavailable
        ? `Gemini 모델(${input.model})을 사용할 수 없습니다. GEMINI_MODEL을 확인하세요. ${detail}`.trim()
        : detail || `HTTP ${response.status}`;
      throw Object.assign(new Error(message), { status });
    }
    const payload = JSON.parse(text) as GeminiPayload;
    const content = (payload.candidates?.[0]?.content?.parts ?? [])
      .filter((part) => part.thought !== true)
      .map((part) => part.text ?? '')
      .join('')
      .trim();
    if (!content) {
      const reason = payload.candidates?.[0]?.finishReason;
      throw Object.assign(new Error(reason ? `Gemini가 응답을 만들지 못했습니다 (${reason})` : '빈 응답'), { status: 502 });
    }
    return { content, model: payload.modelVersion || input.model };
  } finally {
    clearTimeout(timer);
  }
}

const callCompletion = (input: CompletionInput): Promise<CompletionResult> =>
  input.provider === 'gemini' ? callGemini(input) : callOpenAI(input);

interface CleanCut {
  role: 'hook' | 'body' | 'cta';
  emoji: string;
  subtitle: string;
  scene: string;
  duration: number;
}

/** 모델이 준 6컷을 화면이 감당할 수 있는 범위로 다듬습니다. */
function normalizeCuts(value: unknown): CleanCut[] | null {
  if (!Array.isArray(value) || value.length !== 6) return null;
  const cuts: CleanCut[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const raw = (value[index] ?? {}) as Record<string, unknown>;
    let subtitle = str(raw.subtitle, 60).replace(/\s+/g, ' ');
    // 별표 짝이 홀수면 마지막 별표를 지웁니다.
    if (((subtitle.match(/\*/g) ?? []).length ?? 0) % 2 === 1) {
      const at = subtitle.lastIndexOf('*');
      subtitle = `${subtitle.slice(0, at)}${subtitle.slice(at + 1)}`;
    }
    if (subtitle.length < 4) return null;
    const duration = Number(raw.duration);
    const role = index === 0 ? 'hook' : index === 5 ? 'cta' : 'body';
    const emoji = str(raw.emoji, 8) || '✨';
    cuts.push({
      role: raw.role === 'hook' || raw.role === 'cta' || raw.role === 'body' ? raw.role : role,
      emoji,
      subtitle,
      scene: str(raw.scene, 260),
      duration: Number.isFinite(duration) ? Math.min(3.4, Math.max(2.4, duration)) : 3,
    });
  }
  return cuts;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  const method = (req.method ?? 'GET').toUpperCase();
  if (method === 'OPTIONS') {
    for (const [name, value] of Object.entries(CORS)) res.setHeader(name, value);
    res.statusCode = 204;
    res.end();
    return;
  }

  const geminiEnvKey = env().GEMINI_API_KEY?.trim() ?? '';
  const openaiEnvKey = env().OPENAI_API_KEY?.trim() ?? '';
  const geminiModel = env().GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const openaiModel = env().OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;

  if (method === 'GET') {
    const provider: Provider | null = geminiEnvKey ? 'gemini' : openaiEnvKey ? 'openai' : null;
    send(res, 200, {
      ok: true,
      service: SERVICE,
      version: VERSION,
      ai: Boolean(provider),
      provider,
      model: provider === 'gemini' ? geminiModel : provider === 'openai' ? openaiModel : null,
      reason: provider ? undefined : 'no_key',
      templates: [...TEMPLATES],
      tones: [...TONES],
    });
    return;
  }

  if (method !== 'POST') {
    fail(res, 405, 'method_not_allowed', 'GET 또는 POST만 지원합니다.');
    return;
  }

  const body = await readBody(req);
  if (body === null) {
    fail(res, 413, 'too_large', '요청 본문이 너무 크거나 JSON이 아닙니다.');
    return;
  }

  const topic = str(body.topic, 80);
  if (topic.length < 2) {
    fail(res, 400, 'bad_topic', '주제를 두 글자 이상 적어 주세요.');
    return;
  }
  const template = (TEMPLATES as readonly string[]).includes(String(body.template)) ? (body.template as Template) : 'balance';
  const tone = (TONES as readonly string[]).includes(String(body.tone)) ? (body.tone as Tone) : 'cider';

  const requestedKey = str(body.apiKey, 200);
  const isGeminiKey = (key: string) => key.length > 0 && !key.startsWith('sk-');
  const keyShapeOk =
    !requestedKey || /^sk-[A-Za-z0-9\-_*.]{10,}$/.test(requestedKey) || /^[A-Za-z0-9._\-]{10,}$/.test(requestedKey);
  if (!keyShapeOk) {
    fail(res, 400, 'bad_key', 'API 키 형식이 올바르지 않습니다.');
    return;
  }

  const geminiKey = geminiEnvKey || (requestedKey && isGeminiKey(requestedKey) ? requestedKey : '');
  const openaiKey = openaiEnvKey || (requestedKey && !isGeminiKey(requestedKey) ? requestedKey : '');
  const provider: Provider | null = geminiKey ? 'gemini' : openaiKey ? 'openai' : null;
  if (!provider) {
    fail(res, 501, 'no_key', '서버에 GEMINI_API_KEY나 OPENAI_API_KEY가 없습니다. 앱은 내장 엔진으로 대본을 만듭니다.');
    return;
  }

  const requestedModel = str(body.model, 40);
  const model =
    provider === 'gemini'
      ? /^gemini-[a-z0-9.\-]{2,}$/i.test(requestedModel)
        ? requestedModel
        : geminiModel
      : /^(gpt-4o|gpt-4\.1)(-mini)?$/.test(requestedModel)
        ? requestedModel
        : openaiModel;

  try {
    const completion = await callCompletion({
      provider,
      apiKey: provider === 'gemini' ? geminiKey : openaiKey,
      model,
      system: SYSTEM,
      user: buildUserPrompt(topic, template, tone),
      maxTokens: 2_400,
    });
    const data = parseJsonContent(completion.content);
    if (!data) {
      fail(res, 502, 'bad_json', 'AI 응답을 JSON으로 읽지 못했습니다. 내장 엔진으로 만들 수 있습니다.');
      return;
    }
    const cuts = normalizeCuts(data.cuts);
    if (!cuts) {
      fail(res, 502, 'bad_cuts', 'AI가 6컷 형식을 지키지 않았습니다. 내장 엔진으로 만들 수 있습니다.');
      return;
    }
    send(res, 200, {
      ok: true,
      provider,
      model: completion.model,
      title: str(data.title, 40) || topic,
      banner: str(data.banner, 16) || '',
      character: str(data.character, 200),
      cuts,
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 502;
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    fail(res, status === 401 ? 502 : status, status === 401 ? 'provider_auth' : 'upstream', message.slice(0, 200));
  }
}
