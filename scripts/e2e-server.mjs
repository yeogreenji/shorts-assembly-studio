/**
 * E2E용 로컬 서버.
 *   node scripts/e2e-server.mjs ai 4185     → dist 정적 파일 + api/generate.ts (Gemini 응답은 스텁)
 *   node scripts/e2e-server.mjs nokey 4186  → 서버는 있지만 키 없음 (501 no_key)
 *   node scripts/e2e-server.mjs offline 4183→ 정적 파일만 (서버 없음 = GitHub Pages와 같은 상황)
 */
import http from 'node:http';
import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');
const mode = process.argv[2] ?? 'offline';
const port = Number(process.argv[3] ?? 4183);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const AI_CUTS = [
  { role: 'hook', emoji: '🧠', subtitle: 'AI가 쓴 *첫 컷* 훅입니다', duration: 2.8,
    visual: { scene: '퇴근길 지하철', subject: '직장인', expression: '놀란', action: '휴대폰을 보는', camera: 'punch-in', props: ['휴대폰', '시계'], mood: 'tense' } },
  { role: 'body', emoji: '🛠️', subtitle: '두 번째 컷은 *포인트* 하나', duration: 3,
    visual: { scene: '사무실 책상 앞', subject: '직장인', expression: '무표정', action: '지폐를 든', camera: 'push-in', props: ['지폐'], mood: 'cold' } },
  { role: 'body', emoji: '📌', subtitle: '세 번째 컷도 *짧게* 갑니다', duration: 3,
    visual: { scene: '노을 진 옥상', subject: '직장인', expression: '웃는', action: '컵을 든', camera: 'pan-left', props: ['커피'], mood: 'warm' } },
  { role: 'body', emoji: '🔁', subtitle: '네 번째 컷에서 *한 번* 비틀기', duration: 3,
    visual: { scene: '동네 카페 창가', subject: '직장인', expression: '비웃는', action: '팔짱 낀', camera: 'handheld', props: ['커피'], mood: 'comic' } },
  { role: 'body', emoji: '🎯', subtitle: '다섯 번째 컷은 *마무리* 준비', duration: 2.9,
    visual: { scene: '자취방 주방', subject: '직장인', expression: '지친', action: '머리를 감싼', camera: 'tilt-up', props: ['화분'], mood: 'gloomy' } },
  { role: 'cta', emoji: '💬', subtitle: '*댓글*로 알려줘요', duration: 3,
    visual: { scene: '퇴근길 지하철', subject: '직장인', expression: '뿌듯한', action: '주먹 쥔', camera: 'zoom-out', props: ['휴대폰'], mood: 'hype' } },
];

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

/** Gemini 모의 응답 — 어떤 모델·설정으로 불렀는지 .build에 남깁니다. */
async function geminiResponse(url, init = {}) {
  const target = String(url);
  const key = new URL(target).searchParams.get('key') ?? '';
  if (!key || key.startsWith('sk-')) {
    return jsonResponse({ error: { message: 'API key not valid. Please pass a valid API key.' } }, 400);
  }
  const body = JSON.parse(init.body ?? '{}');
  const model = decodeURIComponent((target.split('/models/')[1] || '').split(':')[0]);
  const user = body.contents?.[0]?.parts?.[0]?.text ?? '';
  await mkdir(path.join(here, '.build'), { recursive: true });
  await writeFile(
    path.join(here, '.build', 'gemini-request.json'),
    JSON.stringify({ model, generationConfig: body.generationConfig, system: body.systemInstruction?.parts?.[0]?.text ?? '', user }, null, 2),
    'utf-8',
  );
  if (user.includes('실패')) return jsonResponse({ error: { message: 'stub upstream failure' } }, 500);
  return jsonResponse({
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify({ title: 'AI 테스트 대본', banner: 'AI 테스트', cuts: AI_CUTS }) }],
          role: 'model',
        },
        finishReason: 'STOP',
      },
    ],
    modelVersion: model,
  });
}

async function boot() {
  let handler = null;
  if (mode !== 'offline') {
    const outfile = path.join(here, '.build', 'generate.mjs');
    await build({
      entryPoints: [path.join(root, 'api/generate.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      outfile,
      logLevel: 'silent',
    });

    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      if (String(url).includes(':generateContent')) return geminiResponse(url, init);
      return realFetch(url, init);
    };

    if (mode === 'ai') {
      process.env.GEMINI_API_KEY = 'AQ-test-shortcut-mock-000000';
      delete process.env.OPENAI_API_KEY;
    } else {
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;
    }
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_BASE_URL;
    handler = (await import(`${outfile}?ts=${Date.now()}`)).default;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/api/generate') {
      if (!handler) {
        res.statusCode = 404;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: { code: 'server_unavailable' } }));
        return;
      }
      await handler(req, res);
      return;
    }
    let filePath = path.join(dist, decodeURIComponent(url.pathname));
    if (!filePath.startsWith(dist)) {
      res.statusCode = 403;
      res.end('forbidden');
      return;
    }
    try {
      const content = await readFile(filePath);
      res.statusCode = 200;
      res.setHeader('content-type', MIME[path.extname(filePath)] ?? 'application/octet-stream');
      res.end(content);
    } catch {
      try {
        const content = await readFile(path.join(dist, 'index.html'));
        res.statusCode = 200;
        res.setHeader('content-type', MIME['.html']);
        res.end(content);
      } catch {
        res.statusCode = 404;
        res.end('not found');
      }
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`shortcut e2e server (${mode}) on http://127.0.0.1:${port}/`);
  });
}

boot().catch((error) => {
  console.error(error);
  process.exit(1);
});
