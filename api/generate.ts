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
const TEMPLATES = ['balance', 'living', 'love', 'review', 'it', 'issue'] as const;
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
  balance: 'A와 B 중 하나를 고르는 밸런스 게임. 1번(A)의 매력과 함정, 2번(B)의 매력과 함정을 번갈아 보여 주고 댓글 투표로 끝냅니다. 1컷은 "A vs B"를 그대로 살린 질문으로 씁니다.',
  living: '혼자 사는 사람에게 바로 쓸모 있는 생활 팁. 1컷은 흔한 실수나 돈 새는 지점을 찌르고, 팁 두 개를 이유와 함께 보여 준 뒤 저장을 유도합니다. 장소는 자취방·주방·마트처럼 구체적으로 잡습니다.',
  love: '연애·관계에서 실제로 겪는 장면. 1컷은 "이거 나 얘기인가" 싶은 한 장면이나 대사를 그대로, 2~5컷은 행동 팁 두 개와 흔한 실수, 6컷은 경험을 묻습니다. 카톡·카페·골목 같은 장면을 씁니다.',
  review: '제품·맛집·서비스 솔직 후기. 1컷은 결론이나 가격·대기시간 같은 숫자로 시작하고, 2~5컷은 좋았던 점과 아쉬운 점을 번갈아, 6컷은 누구에게 추천하는지로 끝냅니다. 광고가 아니라 직접 써본 사람의 말투로 쓰고, 특정 상호·브랜드 이름은 쓰지 않습니다.',
  issue: '60초 정보형 뉴스 요약. 1컷은 이번 주 가장 큰 변화 한 줄, 2~4컷은 이슈 세 가지를 하나씩(무슨 일·왜 중요한지), 5컷은 영향 받는 사람, 6컷은 한 줄 결론과 저장 유도. 사실만 단정하지 말고 보도된 내용 기준으로 쓰고, 확인되지 않은 수치·전망은 쓰지 않습니다.',
  it: '기술·서비스 이야기를 어렵지 않게. 1컷은 잘못 알고 있던 상식이나 손해 보는 습관을 찌르고, 쓸모 있는 포인트 두 개를 예시와 함께, 마지막에 저장을 유도합니다.',
};

const TONE_GUIDE: Record<Tone, string> = {
  cider: '사이다 — 군더더기 없이 단호하게. 결론을 먼저 말하고 감정은 눌러 둡니다. "~입니다", "~하세요"로 끊습니다.',
  empathy: '공감 — 1인칭 경험으로 말 걸듯이. "저도 그랬어요", "이거 진짜 힘들죠" 같은 문장을 섞고, 마지막은 다정하게.',
  humor: '유머 — 과장과 자기비하로 한 번 비틀기. 웃고 나서 고개 끄덕이게. 마지막에 팩폭 한 줄.',
};

const SYSTEM = `[SHORTCUT_SHORTS] 당신은 한국 2030 숏폼 쇼츠 대본 작가 겸 그림 감독입니다. 9:16 세로 쇼츠 6컷 대본과, 컷마다 '어떤 그림을 그릴지' 지시를 함께 씁니다.
규칙을 어기면 결과 전체가 폐기됩니다.

[1컷 — 0~2초 훅]
1. 1컷은 스크롤을 멈추게 하는 한 문장입니다. 다음 네 공식 중 하나를 반드시 씁니다: ㉠ 숫자·조건 제시 ㉡ 정면 공감 저격("너도 이거 겪었지?") ㉢ 상식 반전("~라고 생각하면 큰일") ㉣ 둘 중 하나 질문.
2. 1컷 자막은 10~20자. "안녕하세요", "오늘은", "알려드릴게요", "지금부터" 같은 도입은 금지합니다.
3. 1컷에는 주제의 핵심 단어를 그대로 넣습니다.

[2~5컷 — 본문]
4. 컷마다 정보는 하나만. 2컷=문제·공감, 3컷=첫 근거, 4컷=반전·함정, 5컷=정리.
5. 이웃한 컷이 같은 말을 반복하지 않습니다. 컷마다 화면에 보이는 장소와 인물 표정이 달라야 합니다.
6. 자막은 한 컷에 한 문장, 10~26자, 구어체. 강조할 단어 1~2개를 *별표*로 감싸고 짝을 맞춥니다.

[6컷 — 마무리]
7. 댓글 투표나 저장을 부르는 한 문장. 질문형이면 더 좋습니다.

[visual — 그림 지시]
8. 컷마다 visual을 씁니다. 이 값이 실제 일러스트가 되므로 주제에 나온 구체적인 장소·사물을 넣습니다.
9. scene: 장소 2~14자(예: "퇴근길 지하철", "자취방 주방", "비 오는 골목"). 같은 장소를 세 컷 이상 반복하지 않습니다.
10. expression: 지친|놀란|화난|웃는|뿌듯한|무표정|시무룩한|비웃는|혼란스러운 중 하나.
11. action: 손가락으로 짚는|휴대폰을 보는|컵을 든|지폐를 든|팔짱 낀|두 손을 벌린|엄지 척|주먹 쥔|머리를 감싼 중 하나.
12. camera: push-in|zoom-out|punch-in|pan-left|pan-right|tilt-up|handheld|orbit|shake 중 하나. 1컷은 punch-in·push-in·shake 위주.
13. mood: tense|bright|warm|gloomy|comic|dreamy|hype|cold 중 하나.
14. props: 화면에 놓을 사물 0~3개(예: ["지폐","시계"]). 자막에 나온 사물을 먼저 씁니다.
15. palette는 선택. 확신이 없으면 넣지 않습니다(강조색 hex 2개까지).

[공통]
16. 전체 15~20초. duration은 2.4~3.4 사이 숫자(초), 여섯 개 합이 15~20이 되게 합니다.
17. 확인되지 않은 수치·효능·1위 주장을 쓰지 않습니다. 실존 인물·회사·브랜드·실제 사건의 이름을 쓰지 않습니다.
18. emoji는 컷마다 어울리는 이모지 하나(문자 1개). role은 hook, body, cta만 씁니다.
19. 설명 문장이나 코드블록 없이 아래 JSON 객체 하나만 출력합니다.

{"title":"영상 제목 16자 이내","banner":"상단 라벨 10자 이내","cuts":[{"role":"hook","emoji":"🥊","subtitle":"*월급*이냐 *칼퇴*냐, 하나만","duration":2.8,"visual":{"scene":"퇴근길 지하철","subject":"직장인","expression":"지친","action":"휴대폰을 보는","camera":"punch-in","props":["휴대폰","시계"],"mood":"tense"}},{"role":"body","emoji":"💸","subtitle":"","duration":3.0,"visual":{"scene":"사무실 책상 앞","subject":"직장인","expression":"무표정","action":"지폐를 든","camera":"push-in","props":["지폐"],"mood":"cold"}},{"role":"body","emoji":"😵","subtitle":"","duration":3.0,"visual":{"scene":"회의실","subject":"직장인","expression":"놀란","action":"머리를 감싼","camera":"shake","props":["시계"],"mood":"comic"}},{"role":"body","emoji":"🏃","subtitle":"","duration":3.0,"visual":{"scene":"노을 진 옥상","subject":"직장인","expression":"뿌듯한","action":"주먹 쥔","camera":"pan-left","props":["커피"],"mood":"bright"}},{"role":"body","emoji":"🫠","subtitle":"","duration":2.9,"visual":{"scene":"동네 카페","subject":"직장인","expression":"지친","action":"컵을 든","camera":"handheld","props":["커피"],"mood":"warm"}},{"role":"cta","emoji":"💬","subtitle":"","duration":3.0,"visual":{"scene":"사무실 책상 앞","subject":"직장인","expression":"웃는","action":"두 손을 벌린","camera":"zoom-out","props":["휴대폰"],"mood":"bright"}}]}`;

function buildUserPrompt(topic: string, template: Template, tone: Tone): string {
  return `[주제]
${topic}

[카테고리] ${template}
${TEMPLATE_GUIDE[template]}

[톤] ${tone}
${TONE_GUIDE[tone]}

[요청]
1) 위 주제로 6컷 쇼츠 대본 JSON을 만드세요.
2) 1컷은 0~2초에 스크롤을 멈추는 훅 — 네 공식 중 하나.
3) 모든 컷에 visual을 넣고, 장소·표정·동작·카메라를 컷마다 다르게 하세요.
4) 주제에 없는 사실을 만들어 넣지 마세요.`;
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

interface CleanVisual {
  scene: string;
  subject: string;
  expression: string;
  action: string;
  camera: string;
  props: string[];
  mood: string;
  palette?: string[];
}

interface CleanCut {
  role: 'hook' | 'body' | 'cta';
  emoji: string;
  subtitle: string;
  duration: number;
  visual?: CleanVisual;
}

/** 그림 지시 — 길이와 개수만 다듬고, 알아볼 수 없는 값은 비웁니다(앱이 알아서 채웁니다). */
function normalizeVisual(value: unknown): CleanVisual | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const props = Array.isArray(raw.props)
    ? raw.props.map((item) => str(item, 12)).filter(Boolean).slice(0, 3)
    : [];
  const palette = Array.isArray(raw.palette)
    ? raw.palette
        .map((item) => str(item, 9))
        .filter((item) => /^#[0-9a-f]{6}$/i.test(item))
        .slice(0, 2)
    : [];
  const visual: CleanVisual = {
    scene: str(raw.scene, 24),
    subject: str(raw.subject, 20),
    expression: str(raw.expression, 12),
    action: str(raw.action, 20),
    camera: str(raw.camera, 16),
    props,
    mood: str(raw.mood, 12),
  };
  if (palette.length) visual.palette = palette;
  if (!visual.scene && !visual.expression && !visual.action && !visual.camera && !visual.mood && !props.length) {
    return undefined;
  }
  return visual;
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
      duration: Number.isFinite(duration) ? Math.min(3.4, Math.max(2.4, duration)) : 3,
      visual: normalizeVisual(raw.visual),
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
      maxTokens: 1_600,
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
      cuts,
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 502;
    const message = error instanceof Error ? error.message : '알 수 없는 오류';
    fail(res, status === 401 ? 502 : status, status === 401 ? 'provider_auth' : 'upstream', message.slice(0, 200));
  }
}
