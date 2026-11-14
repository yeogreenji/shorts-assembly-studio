#!/usr/bin/env node
/**
 * 숏컷 스튜디오 로컬 렌더 서버
 *
 *   npm run render-server            # http://localhost:8787
 *   PORT=8790 npm run render-server
 *
 * 스튜디오 화면의 [🎬 MP4 만들기]가 이 서버로 프로젝트 JSON을 보내면
 * scripts/render_shorts.py 를 실행해 MP4를 돌려줍니다.
 * 의존성 없이 Node 18+ 만 있으면 돌아갑니다.
 */

import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SCRIPT = join(ROOT, 'scripts', 'render_shorts.py');
const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY = 250 * 1024 * 1024; // 이미지·녹음이 들어 있어 넉넉하게

function findPython() {
  const candidates = [process.env.PYTHON, 'python3', 'python'].filter(Boolean);
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (probe.status === 0) return candidate;
  }
  return null;
}

const python = findPython();
const ffmpegBin = process.env.FFMPEG ?? null;

/** MP4에 들어갈 한국어 AI 목소리(edge-tts) 실행 명령을 찾습니다. */
function findEdgeTts() {
  if (process.env.EDGE_TTS) return [process.env.EDGE_TTS];
  const cli = spawnSync('edge-tts', ['--version'], { encoding: 'utf8' });
  if (cli.status === 0) return ['edge-tts'];
  if (!python) return null;
  const probe = spawnSync(python, ['-c', 'import edge_tts'], { encoding: 'utf8' });
  if (probe.status === 0) return [python, '-m', 'edge_tts'];
  return null;
}

const edgeTts = findEdgeTts();

function log(...args) {
  const time = new Date().toTimeString().slice(0, 8);
  console.log(`[${time}]`, ...args);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'X-Render-Log');
}

function sendJson(res, status, payload) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('요청이 너무 큽니다. 이미지·녹음 용량을 줄여 주세요.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolvePromise(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

let queue = Promise.resolve();

async function render(payload) {
  const workDir = await mkdtemp(join(tmpdir(), 'shortcut-render-'));
  const jsonPath = join(workDir, 'project.json');
  const outPath = join(workDir, 'output.mp4');
  const started = Date.now();
  try {
    await writeFile(jsonPath, JSON.stringify(payload), 'utf8');
    const args = [SCRIPT, jsonPath, '-o', outPath];
    if (ffmpegBin) args.push('--ffmpeg', ffmpegBin);
    const tts = payload?.style?.voice?.tts;
    if (tts?.voice) {
      args.push('--tts', String(tts.voice));
      if (tts.ratePct !== undefined) args.push('--tts-rate', String(tts.ratePct));
      args.push('--voice', 'auto');
    } else {
      args.push('--voice', 'auto');
    }

    const result = await new Promise((resolvePromise, reject) => {
      const child = spawn(python, args, { cwd: workDir });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (data) => {
        stdout += data.toString();
        process.stdout.write(`  ${data.toString()}`);
      });
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0 && existsSync(outPath)) {
          resolvePromise({ stdout: stdout.trim(), stderr: stderr.trim() });
        } else {
          const message = (stderr || stdout || `렌더 스크립트가 코드 ${code}로 끝났습니다.`).trim();
          reject(new Error(message));
        }
      });
    });

    const buffer = await readFile(outPath);
    const info = await stat(outPath);
    return { buffer, log: result.stdout, seconds: ((Date.now() - started) / 1000).toFixed(1), size: info.size };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    const ffmpeg = spawnSync(ffmpegBin ?? 'ffmpeg', ['-version'], { encoding: 'utf8' });
    sendJson(res, 200, {
      ok: Boolean(python) && ffmpeg.status === 0,
      python: python ?? null,
      script: SCRIPT,
      ffmpeg: ffmpeg.status === 0 ? (ffmpeg.stdout.split('\n')[0] ?? '').trim() : null,
      tts: {
        edge: Boolean(edgeTts),
        engine: edgeTts ? edgeTts.join(' ') : null,
        voices: ['ko-KR-SunHiNeural', 'ko-KR-InJoonNeural', 'ko-KR-HyunsuMultilingualNeural'],
        hint: edgeTts ? null : 'AI 목소리를 쓰려면 pip install edge-tts (인터넷 필요)',
      },
      hint: ffmpeg.status !== 0
        ? 'FFmpeg를 찾지 못했습니다. 맥: brew install ffmpeg / 윈도우: winget install ffmpeg'
        : null,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/tts') {
    if (!edgeTts) {
      sendJson(res, 503, {
        error: 'edge-tts가 없습니다. 터미널에서 pip install edge-tts 후 서버를 다시 켜 주세요.',
      });
      return;
    }
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw.toString('utf8') || '{}');
      const text = String(body.text ?? '').replace(/\*/g, '').trim().slice(0, 600);
      if (!text) {
        sendJson(res, 400, { error: '읽을 문장이 비어 있습니다.' });
        return;
      }
      const voice = String(body.voice ?? 'ko-KR-SunHiNeural');
      const ratePct = Math.round(Number(body.ratePct ?? 0));
      const pitchHz = Math.round(Number(body.pitchHz ?? 0));
      const dir = await mkdtemp(join(tmpdir(), 'shortcut-tts-'));
      const out = join(dir, 'voice.mp3');
      try {
        await new Promise((resolvePromise, reject) => {
          const child = spawn(
            edgeTts[0],
            [
              ...edgeTts.slice(1),
              '--voice', voice,
              `--rate=${ratePct >= 0 ? '+' : ''}${ratePct}%`,
              `--pitch=${pitchHz >= 0 ? '+' : ''}${pitchHz}Hz`,
              '--text', text,
              '--write-media', out,
            ],
            { cwd: dir },
          );
          let stderr = '';
          child.stderr.on('data', (data) => {
            stderr += data.toString();
          });
          child.on('error', reject);
          child.on('close', (code) => {
            if (code === 0 && existsSync(out)) resolvePromise();
            else reject(new Error(stderr.trim() || `edge-tts가 코드 ${code}로 끝났습니다.`));
          });
        });
        const buffer = await readFile(out);
        cors(res);
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': String(buffer.length),
          'Cache-Control': 'no-store',
        });
        res.end(buffer);
        log(`AI 보이스 샘플 · ${voice} · ${text.slice(0, 24)}…`);
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
      }
    } catch (error) {
      if (!res.headersSent) sendJson(res, 500, { error: error.message });
      else res.end();
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/') {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><title>숏컷 렌더 서버</title>
<body style="font-family:system-ui;background:#0d0d14;color:#eee;padding:32px;line-height:1.7">
<h1 style="font-size:20px">🎬 숏컷 스튜디오 렌더 서버</h1>
<p>${python ? `파이썬: <code>${python}</code>` : '❌ 파이썬을 찾지 못했습니다.'}</p>
<p>스크립트: <code>${SCRIPT}</code></p>
<p>스튜디오 화면에서 <b>MP4 만들기</b>를 누르면 이 서버가 영상을 조립해서 돌려줍니다.</p>
<p>AI 목소리: ${edgeTts ? 'edge-tts 사용 가능' : '❌ edge-tts 없음 (pip install edge-tts)'}</p>
<p><a style="color:#c084fc" href="/health">/health</a> 로 상태를 확인할 수 있습니다.</p>
<form onsubmit="return false"><button onclick="fetch('/health').then(r=>r.json()).then(j=>alert(JSON.stringify(j,null,2)))"
 style="margin-top:8px;padding:8px 14px;border-radius:8px;border:1px solid #555;background:#1c1c28;color:#eee;cursor:pointer">상태 확인</button></form>
</body>`);
    return;
  }

  if (req.method === 'POST' && url.pathname === '/render') {
    if (!python) {
      sendJson(res, 500, { error: '파이썬(python3)을 찾지 못했습니다. 파이썬을 설치한 뒤 다시 실행해 주세요.' });
      return;
    }
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw.toString('utf8'));
      if (!payload || !Array.isArray(payload.cuts) || payload.cuts.length === 0) {
        sendJson(res, 400, { error: 'cuts 배열이 비어 있습니다. 스튜디오에서 컷을 만들어 주세요.' });
        return;
      }
      const name = String(payload.outputName ?? 'shorts.mp4').replace(/[^\w가-힣.\- ]/g, '_');

      queue = queue.then(async () => {
        log(`렌더 시작 · ${payload.cuts.length}컷 · 제목 "${payload.project?.title ?? ''}"`);
        try {
          const result = await render(payload);
          cors(res);
          res.writeHead(200, {
            'Content-Type': 'video/mp4',
            'Content-Length': String(result.size),
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
            'X-Render-Log': encodeURIComponent(`${result.log} · ${result.seconds}초 소요`),
          });
          res.end(result.buffer);
          log(`렌더 완료 · ${(result.size / 1024 / 1024).toFixed(1)}MB · ${result.seconds}초`);
        } catch (error) {
          log(`렌더 실패 · ${error.message.slice(0, 200)}`);
          if (!res.headersSent) sendJson(res, 500, { error: error.message });
          else res.end();
        }
      });
      queue = queue.catch(() => {});
      await queue;
    } catch (error) {
      if (!res.headersSent) sendJson(res, 500, { error: error.message });
      else res.end();
    }
    return;
  }

  sendJson(res, 404, { error: '없는 경로입니다. GET /health, POST /render 를 써주세요.' });
});

if (!existsSync(SCRIPT)) {
  console.error(`렌더 스크립트를 찾지 못했습니다: ${SCRIPT}`);
  process.exit(1);
}

server.listen(PORT, () => {
  log(`숏컷 스튜디오 렌더 서버 · http://localhost:${PORT}`);
  log(`파이썬: ${python ?? '찾지 못함'}`);
  log(`스크립트: ${SCRIPT}`);
  log(`AI 목소리(edge-tts): ${edgeTts ? edgeTts.join(' ') : '없음 — pip install edge-tts'}`);
  if (!python) log('⚠ 파이썬이 없으면 렌더할 수 없습니다. python3를 설치해 주세요.');
});
