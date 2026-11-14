import type { Cut, MediaAsset, Project, RenderPayload } from '../types';
import { THEME_MAP } from './presets';
import { buildSrt, buildTranscript, totalDuration } from './srt';
import { parseHighlight } from './tts';

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

export async function fileToAsset(file: File, kind: 'image' | 'audio'): Promise<MediaAsset> {
  const limit = kind === 'image' ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
  if (file.size > limit) {
    throw new Error(`${kind === 'image' ? '이미지' : '오디오'}는 ${Math.round(limit / 1024 / 1024)}MB 이하만 올릴 수 있습니다.`);
  }
  const dataUrl = await readFileAsDataUrl(file);
  if (kind === 'image' && !dataUrl.startsWith('data:image/')) {
    throw new Error('이미지 파일(png·jpg·webp)만 올릴 수 있습니다.');
  }
  if (kind === 'audio' && !dataUrl.startsWith('data:audio/') && !dataUrl.startsWith('data:video/')) {
    throw new Error('오디오 파일(mp3·wav·m4a·webm)만 올릴 수 있습니다.');
  }
  return { name: file.name, dataUrl };
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
  // BOM 없이 저장합니다. BOM이 붙으면 일부 편집기·스크립트가 첫 줄을 잘못 읽습니다.
  downloadBlob(filename, new Blob([text], { type: mime }));
}

export function safeFileName(input: string, fallback = 'shorts'): string {
  const cleaned = input
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, '_')
    .trim()
    .slice(0, 60);
  return cleaned || fallback;
}

export function buildRenderPayload(project: Project): RenderPayload {
  return {
    version: 1,
    project: { title: project.title },
    canvas: { width: 1080, height: 1920, fps: 30 },
    style: {
      subtitle: {
        position: project.subtitle.position,
        sizePx: project.subtitle.sizePx,
        color: project.subtitle.color,
        highlight: project.subtitle.highlight,
        outline: project.subtitle.outline,
      },
      headline: { enabled: project.headline.enabled, sizePx: project.headline.sizePx },
      banner: { enabled: project.banner.enabled, text: project.banner.text },
      voice: {
        name: project.voice.voiceName,
        lang: project.voice.lang,
        rate: project.voice.rate,
        pitch: project.voice.pitch,
        tts: {
          engine: project.aiVoice.engine,
          voice: project.aiVoice.voice,
          ratePct: project.aiVoice.ratePct,
          pitchHz: project.aiVoice.pitchHz,
        },
      },
      bgm: { mood: project.bgm.mood, volume: project.bgm.volume },
    },
    cuts: project.cuts.map((cut) => ({ ...cut })),
  };
}

/**
 * /presets/... 같은 public 경로로 들어 있는 장면 이미지를 data URL로 바꿔 둡니다.
 * 이렇게 하면 내려받은 JSON 하나만으로도 렌더 스크립트가 그림을 찾습니다.
 */
export async function inlineImageAssets(payload: RenderPayload): Promise<RenderPayload> {
  const cuts = await Promise.all(
    payload.cuts.map(async (cut) => {
      const source = cut.image?.dataUrl;
      if (!cut.image || !source || source.startsWith('data:')) return cut;
      try {
        const response = await fetch(source);
        if (!response.ok) return cut;
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ''));
          reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
          reader.readAsDataURL(blob);
        });
        return { ...cut, image: { name: cut.image.name, dataUrl } };
      } catch {
        return cut;
      }
    }),
  );
  return { ...payload, cuts };
}

export interface ExportBundle {
  txt: string;
  srt: string;
  json: string;
}

export function buildExportBundle(project: Project): ExportBundle {
  return {
    txt: buildTranscript(project),
    srt: buildSrt(project),
    json: JSON.stringify(buildRenderPayload(project), null, 2),
  };
}

export interface RenderServerResult {
  blob: Blob;
  filename: string;
  log: string;
}

export async function renderOnServer(
  payload: RenderPayload,
  serverUrl: string,
  filename: string,
): Promise<RenderServerResult> {
  const base = serverUrl.replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${base}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, outputName: filename }),
    });
  } catch {
    throw new Error(
      `렌더 서버(${base})에 연결하지 못했습니다. 터미널에서 "npm run render-server"를 실행했는지 확인해 주세요.`,
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`렌더 서버가 오류를 돌려줬습니다 (${response.status}). ${detail.slice(0, 300)}`);
  }

  const rawLog = response.headers.get('X-Render-Log') ?? '';
  let log = rawLog;
  try {
    // 서버가 한글 로그를 encodeURIComponent로 실어 보냅니다.
    log = rawLog ? decodeURIComponent(rawLog) : '';
  } catch {
    log = rawLog;
  }
  const blob = await response.blob();
  return { blob, filename, log };
}

export interface VoiceSampleRequest {
  text: string;
  voice: string;
  ratePct?: number;
  pitchHz?: number;
}

/** 렌더 서버의 /tts 로 문장 하나를 AI 목소리(mp3)로 받아 미리듣습니다. */
export async function requestVoiceSample(
  serverUrl: string,
  request: VoiceSampleRequest,
): Promise<HTMLAudioElement> {
  const base = serverUrl.replace(/\/+$/, '');
  let response: Response;
  try {
    response = await fetch(`${base}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error(
      `렌더 서버(${base})에 연결하지 못했습니다. 터미널에서 "npm run render-server"를 켜 두면 AI 보이스를 미리들을 수 있습니다.`,
    );
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`AI 보이스를 만들지 못했습니다. ${detail.slice(0, 240)}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
  return audio;
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  document.execCommand('copy');
  area.remove();
  return Promise.resolve();
}

export function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  const pushChar = (chunk: string) => {
    // 한글은 단어 중간에서도 끊어야 할 때가 있습니다.
    for (const ch of chunk) {
      const candidate = current + ch;
      if (ctx.measureText(candidate.trim()).width > maxWidth && current.trim()) {
        lines.push(current.trim());
        current = ch;
      } else {
        current = candidate;
      }
    }
  };

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current.trim());
      current = '';
      pushChar(word);
    } else {
      current = candidate;
    }
    if (current.length > 40) {
      const rest = current;
      current = '';
      pushChar(rest);
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 9:16 썸네일(1080×1920) PNG를 캔버스로 그립니다. */
export async function renderThumbnailPng(project: Project, cutIndex = 0): Promise<Blob> {
  const cut: Cut = project.cuts[cutIndex] ?? project.cuts[0];
  if (!cut) throw new Error('컷이 없습니다.');
  const W = 1080;
  const H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들지 못했습니다.');

  const theme = THEME_MAP[cut.theme];
  if (cut.image) {
    const image = await loadImage(cut.image.dataUrl);
    drawCover(ctx, image, W, H);
    const veil = ctx.createLinearGradient(0, 0, 0, H);
    veil.addColorStop(0, 'rgba(0,0,0,0.55)');
    veil.addColorStop(0.45, 'rgba(0,0,0,0.15)');
    veil.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, W, H);
  } else {
    const grad = ctx.createLinearGradient(0, 0, W * 0.4, H);
    grad.addColorStop(0, theme.from);
    grad.addColorStop(1, theme.to);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.75, H * 0.18, 60, W * 0.75, H * 0.18, W * 0.9);
    glow.addColorStop(0, 'rgba(255,255,255,0.28)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  }

  const veil = ctx.createLinearGradient(0, 0, 0, H);
  veil.addColorStop(0, 'rgba(0,0,0,0.42)');
  veil.addColorStop(0.5, 'rgba(0,0,0,0.08)');
  veil.addColorStop(1, 'rgba(0,0,0,0.68)');
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, W, H);

  // 상단 배지
  ctx.font = '600 34px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
  const badge = cut.role === 'hook' ? 'BALANCE GAME' : 'A or B';
  const badgeWidth = ctx.measureText(badge).width + 56;
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  roundRect(ctx, 76, 120, badgeWidth, 74, 37);
  ctx.fill();
  ctx.fillStyle = theme.accent;
  ctx.fillText(badge, 104, 168);

  // 헤드라인
  const headline = (cut.headline || project.title).trim();
  ctx.font = `900 ${project.headline.sizePx * 1.35}px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif`;
  ctx.textBaseline = 'top';
  const lines = wrapLines(ctx, headline, W - 190).slice(0, 4);
  const lineHeight = project.headline.sizePx * 1.55;
  // 헤드라인 블록을 화면 위쪽 1/3 지점에 오도록 세로 정렬
  let y = Math.max(H * 0.2, H * 0.34 - (lines.length * lineHeight) / 2);
  lines.forEach((line, index) => {
    ctx.fillStyle = index === lines.length - 1 && lines.length > 1 ? theme.accent : '#ffffff';
    ctx.lineWidth = 16;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(line, 84, y);
    ctx.fillText(line, 84, y);
    y += lineHeight;
  });

  // 하단 자막 칩
  const subtitle = cut.subtitle.replace(/\*/g, '').trim();
  if (subtitle) {
    ctx.font = '600 44px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
    const subLines = wrapLines(ctx, subtitle, W - 240).slice(0, 2);
    const chipHeight = subLines.length * 66 + 56;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, 84, H - 360 - chipHeight, W - 168, chipHeight, 28);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    subLines.forEach((line, index) => {
      ctx.fillText(line, 124, H - 360 - chipHeight + 28 + index * 66);
    });
  }

  ctx.font = '700 32px "Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('숏컷 스튜디오', 84, H - 190);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText(`${project.cuts.length}컷 · ${totalDuration(project.cuts).toFixed(0)}초`, W - 300, H - 190);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('썸네일을 만들지 못했습니다.');
  return blob;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'));
    image.src = src;
  });
}

function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, W: number, H: number): void {
  const scale = Math.max(W / image.width, H / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (W - w) / 2, (H - h) / 2, w, h);
}

export function subtitleSegments(text: string) {
  return parseHighlight(text);
}
