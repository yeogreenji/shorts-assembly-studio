/**
 * E2E용 로컬 서버.
 *   node scripts/e2e-server.mjs ai 4185     → dist 정적 파일 + api/generate.ts (Gemini 응답은 스텁) + api/tts.ts (음성은 스텁)
 *   node scripts/e2e-server.mjs nokey 4186  → 서버는 있지만 Gemini 키 없음 (501 no_key). 음성(TTS)은 키가 필요 없어 그대로 동작
 *   node scripts/e2e-server.mjs offline 4183→ 정적 파일만 (서버 없음 = GitHub Pages와 같은 상황)
 *   node scripts/e2e-server.mjs ttsx 4190   → Gemini 키 없이 OpenAI 음성 키만 (음성 어댑터 검증)
 */
import http from 'node:http';
import path from 'node:path';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
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
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const AI_CUTS = [
  { role: 'hook', emoji: '🧠', subtitle: 'AI가 쓴 *첫 컷* 훅입니다', voice: 'AI가 쓴 첫 컷 훅입니다. 오늘은 이 한 줄로 시작합니다.', duration: 4.2,
    visual: { scene: '퇴근길 지하철', subject: '직장인', expression: '놀란', action: '휴대폰을 보는', camera: 'punch-in', props: ['휴대폰', '시계'], mood: 'tense' } },
  { role: 'body', emoji: '🛠️', subtitle: '두 번째 컷은 *포인트* 하나', voice: '두 번째 컷은 포인트 하나만 말합니다. 조건을 붙이면 결과가 달라집니다.', duration: 4.6,
    visual: { scene: '사무실 책상 앞', subject: '직장인', expression: '무표정', action: '지폐를 든', camera: 'push-in', props: ['지폐'], mood: 'cold' } },
  { role: 'body', emoji: '📌', subtitle: '세 번째도 *짧게* 갑니다', voice: '세 번째도 짧게 갑니다. 설명보다 예시가 오래 남습니다.', duration: 4,
    visual: { scene: '노을 진 옥상', subject: '직장인', expression: '웃는', action: '컵을 든', camera: 'pan-left', props: ['커피'], mood: 'warm' } },
  { role: 'body', emoji: '🔁', subtitle: '네 번째에서 *한 번* 비틀기', voice: '네 번째 컷에서 한 번 비틉니다. 대부분 여기서 고개를 끄덕입니다.', duration: 4.4,
    visual: { scene: '동네 카페 창가', subject: '직장인', expression: '비웃는', action: '팔짱 낀', camera: 'handheld', props: ['커피'], mood: 'comic' } },
  { role: 'body', emoji: '🎯', subtitle: '다섯 번째는 *근거*입니다', voice: '다섯 번째는 근거입니다. 숫자 하나면 충분합니다.', duration: 4,
    visual: { scene: '자취방 주방', subject: '직장인', expression: '지친', action: '머리를 감싼', camera: 'tilt-up', props: ['화분'], mood: 'gloomy' } },
  { role: 'body', emoji: '🧩', subtitle: '여섯 번째, *반전* 준비', voice: '여섯 번째에서 반전을 준비합니다. 지금까지와 반대로 가면 어떻게 될까요.', duration: 4.6,
    visual: { scene: '회의실', subject: '직장인', expression: '혼란스러운', action: '손가락으로 짚는', camera: 'orbit', props: ['차트'], mood: 'tense' } },
  { role: 'body', emoji: '💡', subtitle: '핵심은 *순서*라는 것', voice: '핵심은 순서입니다. 같은 일도 순서를 바꾸면 결과가 달라집니다.', duration: 4.4,
    visual: { scene: 'AI 작업실', subject: '직장인', expression: '무표정', action: '노트북을 보는', camera: 'slide', props: ['노트북'], mood: 'cold' } },
  { role: 'body', emoji: '📉', subtitle: '반대로 하면 *손해*', voice: '반대로 하면 손해입니다. 시간도 돈도 두 번 씁니다.', duration: 4.2,
    visual: { scene: '도시의 밤', subject: '직장인', expression: '지친', action: '팔짱 낀', camera: 'pan-right', props: ['지폐'], mood: 'tense' } },
  { role: 'body', emoji: '🪞', subtitle: '결국 *내 상황*이 답', voice: '결국 내 상황이 답입니다. 남의 기준으로 고르면 오래 못 갑니다.', duration: 4.6,
    visual: { scene: '자취방 창가', subject: '직장인', expression: '무표정', action: '두 손을 벌린', camera: 'push-in', props: ['시계'], mood: 'bright' } },
  { role: 'cta', emoji: '💬', subtitle: '*댓글*로 알려줘요', voice: '당신은 어느 쪽이에요? 댓글로 알려주세요.', duration: 3.6,
    visual: { scene: '퇴근길 지하철', subject: '직장인', expression: '뿌듯한', action: '주먹 쥔', camera: 'zoom-out', props: ['휴대폰'], mood: 'hype' } },
];

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * 음성 스텁 — 실제 Google TTS 대신 짧은 WAV를 돌려줍니다.
 * (오디오 디코드·믹싱·덕킹 경로는 실제와 똑같이 지나갑니다)
 */
function stubSpeech(text) {
  // 실제 낭독 속도(약 7자/초)에 가깝게 — 호흡 블록이 길면 길게 돌려줍니다.
  const seconds = Math.max(0.6, Math.min(30, text.length / 7.2));
  const rate = 22050;
  const frames = Math.floor(rate * seconds);
  const data = Buffer.alloc(frames * 2);
  const words = Math.max(1, text.split(/\s+/).length);
  for (let i = 0; i < frames; i += 1) {
    const t = i / rate;
    const syllable = Math.sin(2 * Math.PI * 3.1 * t) > 0 ? 1 : 0.35;
    const pace = 130 + ((i / frames) * words * 26) % 60;
    const value = Math.sin(2 * Math.PI * pace * t) * 0.42 * syllable;
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(value * 32767))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function openAiSpeechResponse(init) {
  let input = '';
  let voice = '';
  try {
    const body = JSON.parse(init.body ?? '{}');
    input = body.input ?? '';
    voice = body.voice ?? '';
  } catch {
    /* 본문 없음 */
  }
  const audio = stubSpeech(input);
  return new Response(audio, {
    status: 200,
    headers: { 'content-type': 'audio/mpeg', 'x-test-openai-voice': voice },
  });
}

async function speechResponse(target) {
  const url = new URL(String(target));
  const text = url.searchParams.get('q') ?? '';
  const total = Number(url.searchParams.get('total') ?? '1');
  if (!text.trim() || text.length > 200) {
    return new Response('bad text', { status: 400 });
  }
  return new Response(stubSpeech(text), { status: 200, headers: { 'content-type': 'audio/wav' } });
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
  let ttsHandler = null;
  const ttsOut = path.join(here, '.build', 'tts.mjs');
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

    await build({
      entryPoints: [path.join(root, 'api/tts.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      outfile: ttsOut,
      logLevel: 'silent',
    });

    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      const target = String(url);
      if (target.includes(':generateContent')) return geminiResponse(url, init);
      if (target.includes('translate_tts')) return speechResponse(target);
      if (target.includes('/v1/audio/speech')) return openAiSpeechResponse(init);
      return realFetch(url, init);
    };

    if (mode === 'ai') {
      process.env.GEMINI_API_KEY = 'AQ-test-shortcut-mock-000000';
      delete process.env.OPENAI_API_KEY;
    } else if (mode === 'ttsx') {
      // 음성 어댑터 검증 — Gemini 키 없이 OpenAI 음성만 있는 서버
      delete process.env.GEMINI_API_KEY;
      process.env.OPENAI_API_KEY = 'sk-test-shortcut-tts-000000';
      process.env.OPENAI_TTS_MODEL = 'gpt-4o-mini-tts';
    } else {
      delete process.env.GEMINI_API_KEY;
      delete process.env.OPENAI_API_KEY;
    }
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_BASE_URL;
    handler = (await import(`${outfile}?ts=${Date.now()}`)).default;
    ttsHandler = (await import(`${ttsOut}?ts=${Date.now()}`)).default;
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
    if (url.pathname === '/api/tts') {
      // 앱이 실제로 보낸 요청을 그대로 남깁니다(엔진·보이스·스타일 검증용).
      const text = url.searchParams.get('text');
      if (text) {
        await mkdir(path.join(here, '.build'), { recursive: true });
        await appendFile(
          path.join(here, '.build', 'tts-calls.jsonl'),
          JSON.stringify({
            text,
            voice: url.searchParams.get('voice'),
            style: url.searchParams.get('style'),
            provider: url.searchParams.get('provider'),
          }) + '\n',
          'utf-8',
        );
      }
      if (!ttsHandler) {
        res.statusCode = 404;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: { code: 'server_unavailable' } }));
        return;
      }
      await ttsHandler(req, res);
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
