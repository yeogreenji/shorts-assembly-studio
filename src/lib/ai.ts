import type { CutVisual, Shorts, Shot, TemplateId, Tone } from '../types';
import { TEMPLATE_MAP, roleOf } from './templates';
import { clampText, normalizeMarks } from './text';
import { newSeed } from './motion/rng';
import { BGM_BY_TEMPLATE, DEFAULT_AUDIO, DEFAULT_BRAND, DEFAULT_STYLE } from './defaults';

/**
 * api/generate.ts (Vercel Serverless Function)와 이야기하는 클라이언트.
 * 서버가 없거나 키가 없으면 조용히 내장 엔진으로 넘어갑니다(localEngine.ts).
 */

export const GENERATE_ENDPOINT = '/api/generate';

export interface AiInput {
  topic: string;
  template: TemplateId;
  tone: Tone;
}

export type ServerState =
  | { state: 'checking' }
  | { state: 'ai'; provider: string; model: string }
  | { state: 'local'; reason: string };

interface ServerStatus {
  ok?: boolean;
  ai?: boolean;
  provider?: string | null;
  model?: string;
  reason?: string;
}

const withTimeout = (ms: number) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  return { controller, done: () => window.clearTimeout(timer) };
};

/** 앱을 열 때 한 번 — AI 대본을 쓸 수 있는 서버인지 확인합니다. */
export async function probeGenerateServer(timeoutMs = 5000): Promise<ServerState> {
  const { controller, done } = withTimeout(timeoutMs);
  try {
    const response = await fetch(`${GENERATE_ENDPOINT}?probe=1`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: ServerStatus | null = null;
    try {
      payload = JSON.parse(text) as ServerStatus;
    } catch {
      // GitHub Pages 같은 정적 호스팅은 index.html을 돌려줍니다.
      return { state: 'local', reason: 'no_server' };
    }
    if (!response.ok || !payload?.ok) return { state: 'local', reason: payload?.reason ?? 'no_server' };
    if (!payload.ai) return { state: 'local', reason: payload.reason ?? 'no_key' };
    return { state: 'ai', provider: payload.provider ?? 'ai', model: payload.model ?? '' };
  } catch {
    return { state: 'local', reason: 'no_server' };
  } finally {
    done();
  }
}

interface AiCut {
  role?: string;
  emoji?: string;
  subtitle?: string;
  duration?: number;
  visual?: Record<string, unknown>;
}

interface AiPayload {
  ok?: boolean;
  title?: string;
  banner?: string;
  cuts?: AiCut[];
  model?: string;
  error?: { code?: string; message?: string };
}

const cleanText = (value: unknown, limit: number): string =>
  typeof value === 'string' ? clampText(value.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim(), limit) : '';

/** AI가 준 장면 지시를 화면이 감당할 수 있는 형태로 다듬습니다. */
function toVisual(raw: unknown): CutVisual | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as Record<string, unknown>;
  const props = Array.isArray(record.props)
    ? record.props.map((item) => cleanText(item, 12)).filter(Boolean).slice(0, 3)
    : [];
  const visual: CutVisual = {
    scene: cleanText(record.scene, 24),
    subject: cleanText(record.subject, 20),
    expression: cleanText(record.expression, 12),
    action: cleanText(record.action, 20),
    camera: cleanText(record.camera, 16),
    props,
    mood: cleanText(record.mood, 12),
  };
  const palette = Array.isArray(record.palette)
    ? record.palette.map((item) => cleanText(item, 9)).filter((item) => /^#[0-9a-f]{6}$/i.test(item)).slice(0, 3)
    : [];
  if (palette.length) visual.palette = palette;
  if (!visual.scene && !visual.expression && !visual.action && !visual.props.length) return undefined;
  return visual;
}

function toShots(cuts: AiCut[]): Shot[] | null {
  if (cuts.length !== 6) return null;
  const stamp = Date.now().toString(36);
  const shots: Shot[] = [];
  for (let index = 0; index < cuts.length; index += 1) {
    const cut = cuts[index];
    const subtitle = clampText(normalizeMarks(String(cut?.subtitle ?? '').replace(/\s+/g, ' ')), 46);
    if (subtitle.length < 4) return null;
    const duration = Number(cut?.duration);
    shots.push({
      id: `cut-${stamp}-${index}`,
      role: roleOf(index),
      emoji: clampText(String(cut?.emoji ?? '').trim(), 4) || '✨',
      subtitle,
      duration: Number.isFinite(duration) ? Math.min(3.6, Math.max(2.2, duration)) : 3,
      visual: toVisual(cut?.visual),
    });
  }
  return shots;
}

/** 서버 AI에게 6컷 대본을 받아옵니다. 실패하면 예외를 던지고, 호출한 쪽이 내장 엔진으로 넘어갑니다. */
export async function requestAiShorts(input: AiInput, timeoutMs = 22000): Promise<Shorts> {
  const { controller, done } = withTimeout(timeoutMs);
  try {
    const response = await fetch(GENERATE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ topic: input.topic, template: input.template, tone: input.tone }),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: AiPayload | null = null;
    try {
      payload = JSON.parse(text) as AiPayload;
    } catch {
      throw new Error('AI 서버 응답을 읽지 못했습니다');
    }
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error?.message ?? `AI 서버 오류 (${response.status})`);
    }
    const cuts = Array.isArray(payload?.cuts) ? toShots(payload.cuts) : null;
    if (!cuts) throw new Error('AI 대본 형식이 올바르지 않습니다');
    const template = TEMPLATE_MAP[input.template];
    return {
      title: clampText(String(payload?.title ?? '').trim(), 40) || clampText(input.topic, 22),
      topic: input.topic,
      template: input.template,
      tone: input.tone,
      banner: clampText(String(payload?.banner ?? '').trim(), 16) || template.banner,
      cuts,
      source: 'ai',
      updatedAt: Date.now(),
      seed: newSeed(),
      audio: { ...DEFAULT_AUDIO, mood: BGM_BY_TEMPLATE[input.template] },
      style: { ...DEFAULT_STYLE },
      brand: { ...DEFAULT_BRAND },
    };
  } finally {
    done();
  }
}
