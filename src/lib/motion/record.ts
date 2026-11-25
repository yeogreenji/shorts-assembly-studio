import type { AudioSettings } from '../../types';
import type { ScenePlan } from './scene';
import { renderFrame } from './draw';
import { preloadArts } from './artLoader';
import type { MotionLevel } from './stage';
import { BgmEngine } from '../audio/bgm';
import { AudioMixer } from '../audio/mixer';
import type { VoicePreset } from '../audio/tts';

/** 모션 일러스트 + 나레이션 + 배경음을 그대로 한 파일로 녹화합니다. (서버·유료 API 없이 브라우저만 사용) */

export type ExportStage = 'prepare' | 'record' | 'finalize';

export interface NarrationTrack {
  /** 이 조각이 시작하는 영상 시각(초) */
  start: number;
  buffer: AudioBuffer;
  /** 이 조각을 재생할 최대 길이 — 컷·호흡 창을 넘겨 겹치지 않게 */
  maxSeconds?: number;
  /** 트랙별 배속(없으면 전체 speed) */
  rate?: number;
  /** 트랙별 톤(센트) */
  tone?: number;
  /** 내 목소리 트랙은 프리셋·톤 처리를 하지 않습니다 */
  raw?: boolean;
}

export interface NarrationExport {
  preset: VoicePreset;
  tracks: NarrationTrack[];
  /** 0~1 */
  gain?: number;
  /** 프리셋 위에 거는 속도 배율 */
  speed?: number;
  /** 목소리 톤(센트) */
  tone?: number;
  /** 음성 구간에 배경음을 낮출지 */
  ducking?: boolean;
}

export interface VideoExportOptions {
  onProgress?: (ratio: number) => void;
  onStage?: (stage: ExportStage) => void;
  /** 배경음 — 설정된 무드를 캔버스 영상의 오디오 트랙으로 함께 녹음합니다. */
  audio?: AudioSettings;
  /** 컷 시작 시각 — 전환 효과음을 비트에 맞춰 넣는 데 씁니다. */
  cutStarts?: number[];
  /** 나레이션 — 컷 시작 시각에 맞춰 음성을 얹고, 그동안 배경음을 낮춥니다. */
  narration?: NarrationExport | null;
  /** 사용자가 취소 버튼을 누르면 녹화를 멈추고 결과를 버립니다. */
  signal?: AbortSignal;
  width?: number;
  height?: number;
  fps?: number;
  /** 미리보기와 같은 모션 강도 — 녹화 결과가 화면과 100% 같아집니다. */
  motion?: MotionLevel | number;
  /** Free 요금제 표식 */
  platformMark?: boolean;
}

export interface VideoExportResult {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  seconds: number;
  /** 오디오 트랙이 실제로 들어갔는지 */
  withAudio: boolean;
  /** 실제로 들어간 나레이션 컷 수 */
  narratedCuts: number;
  /** 화면에 표시할 형식 이름 (MP4 · H.264 / WebM · VP9) */
  formatLabel: string;
}

/** 사용자가 녹화를 취소했을 때 — 실패가 아니라 정상적인 중단입니다. */
export class ExportCanceled extends Error {
  constructor() {
    super('영상 저장을 취소했습니다.');
    this.name = 'ExportCanceled';
  }
}

export function isVideoExportSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

// 브라우저가 '진짜 H.264/AAC MP4'를 지원한다고 알릴 때만 MP4를 고릅니다.
// codec을 빼고 'video/mp4'만 물으면 VP9이 MP4 껍데기에 들어간 파일이 나오는데,
// 그건 편집 앱·플랫폼 업로드에서 자주 거절됩니다(이럴 때는 WebM이 안전합니다).
const MP4_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1.4D401F,mp4a.40.2',
  'video/mp4;codecs=avc1.640028,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a',
];
const WEBM_CANDIDATES = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9', 'video/webm'];

function firstSupported(candidates: string[]): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

export interface ExportFormats {
  mp4: boolean;
  webm: boolean;
  /** 이 브라우저가 고르는 형식 */
  preferred: 'mp4' | 'webm' | null;
  label: string;
  mimeType: string | null;
}

/** 브라우저가 MP4(H.264)를 녹화할 수 있으면 MP4를 먼저 씁니다 — 편집 앱·플랫폼 업로드가 편합니다. */
export function exportFormats(): ExportFormats {
  const mp4 = firstSupported(MP4_CANDIDATES);
  const webm = firstSupported(WEBM_CANDIDATES);
  const preferred: 'mp4' | 'webm' | null = mp4 ? 'mp4' : webm ? 'webm' : null;
  return {
    mp4: Boolean(mp4),
    webm: Boolean(webm),
    preferred,
    label: preferred === 'mp4' ? 'MP4 · H.264' : preferred === 'webm' ? 'WebM · VP9' : '지원 안 됨',
    mimeType: mp4 ?? webm,
  };
}

export async function exportVideo(plan: ScenePlan, options: VideoExportOptions = {}): Promise<VideoExportResult> {
  if (!isVideoExportSupported()) throw new Error('이 브라우저는 영상 녹화를 지원하지 않습니다. 크롬·엣지에서 다시 시도해 주세요.');
  const formats = exportFormats();
  const mimeType = formats.mimeType;
  if (!mimeType) throw new Error('이 브라우저에서 쓸 수 있는 영상 형식이 없습니다.');

  options.onStage?.('prepare');
  // 일러스트와 웹폰트, 내 이미지가 준비된 뒤에 녹화를 시작합니다 — 빈 배경이 찍히지 않게.
  await preloadArts(plan.cuts.map((cut) => cut.art.id));
  try {
    await document.fonts?.ready;
  } catch {
    /* 폰트 로딩을 기다릴 수 없는 브라우저 */
  }
  if (options.signal?.aborted) throw new ExportCanceled();

  const width = options.width ?? 720;
  const height = options.height ?? 1280;
  const total = Math.max(1, plan.total);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  // frameRate 0 + requestFrame(): 합성기가 캔버스를 '보이지 않는다'고 판단해도
  // 그린 프레임이 반드시 녹화되도록 직접 프레임을 밀어 넣습니다.
  const stream = canvas.captureStream(0);
  const videoTrack = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;

  // ── 소리: 배경음 + 나레이션을 한 믹서에서 섞어 하나의 오디오 트랙으로 ──
  const audio = options.audio;
  const wantBgm = Boolean(audio && audio.mood !== 'off' && !audio.muted);
  const narration = options.narration ?? null;
  const wantVoice = Boolean(narration && narration.tracks.length > 0 && audio?.narration !== false && !audio?.muted);
  const mix = wantBgm || wantVoice ? new AudioMixer({ stream: true, monitor: false }) : null;
  const bgm = mix && wantBgm ? new BgmEngine(() => mix.sink()) : null;
  let bgmStarted = false;
  let withAudio = false;
  let narratedCuts = 0;

  if (mix && audio) {
    await mix.resume();
    if (bgm) {
      // 오디오 장치가 없는 환경에서 여기서 멈추면 영상 저장 자체가 막힙니다 — 잠깐만 기다립니다.
      bgmStarted = await Promise.race([
        bgm.start(0, {
          mood: audio.mood,
          volume: audio.volume,
          muted: audio.muted,
          accents: audio.accents,
          total,
          cutStarts: options.cutStarts ?? plan.starts,
        }),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2500)),
      ]);
    }

    const anchor = bgmStarted && bgm ? bgm.startTime : mix.now + 0.06;
    if (wantVoice && narration) {
      for (const track of narration.tracks) {
        const raw = track.raw === true;
        const played = mix.playVoice(track.buffer, narration.preset, anchor + track.start, {
          rate: track.rate ?? narration.speed ?? 1,
          tone: track.tone ?? narration.tone ?? 0,
          gain: narration.gain ?? 1,
          duck: narration.ducking !== false && bgmStarted,
          maxSeconds: track.maxSeconds,
          lowShelf: raw ? undefined : narration.preset.lowShelf,
          lowpass: raw ? undefined : narration.preset.lowpass,
          warmth: raw ? 0.6 : narration.preset.warmth + 1.2,
        });
        if (played) narratedCuts += 1;
      }
    }

    const audioTracks = mix.stream?.getAudioTracks() ?? [];
    if (audioTracks.length && (bgmStarted || narratedCuts > 0)) {
      for (const track of audioTracks) stream.addTrack(track);
      withAudio = true;
    } else {
      bgm?.dispose();
    }
  }

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: height >= 1800 ? 9_000_000 : 5_500_000,
    audioBitsPerSecond: 128_000,
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  const finished = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error('영상 녹화 중 오류가 났습니다.'));
  });

  renderFrame(canvas, plan, 0, { captions: true, hud: true, motion: options.motion, platformMark: options.platformMark });
  videoTrack?.requestFrame?.();
  recorder.start(250);
  options.onStage?.('record');
  const startedAt = performance.now();
  let canceled = false;

  await new Promise<void>((resolve) => {
    const loop = () => {
      if (options.signal?.aborted) {
        canceled = true;
        resolve();
        return;
      }
      const elapsed = (performance.now() - startedAt) / 1000;
      const at = Math.min(total, elapsed);
      renderFrame(canvas, plan, at, { captions: true, hud: true, motion: options.motion, platformMark: options.platformMark });
      videoTrack?.requestFrame?.();
      options.onProgress?.(Math.min(1, elapsed / total));
      if (elapsed < total + 0.08) {
        requestAnimationFrame(loop);
      } else {
        resolve();
      }
    };
    requestAnimationFrame(loop);
  });

  options.onStage?.('finalize');
  recorder.stop();
  // 오디오 장치가 없는 환경에서도 녹화가 멈추지 않게 안전장치를 둡니다.
  await Promise.race([finished, new Promise<void>((resolve) => setTimeout(resolve, 4000))]);
  bgm?.dispose();
  mix?.close();
  for (const track of stream.getTracks()) track.stop();

  if (canceled) throw new ExportCanceled();

  const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
  if (blob.size === 0) throw new Error('녹화된 영상이 비어 있습니다. 다시 시도해 주세요.');
  return {
    blob,
    mimeType,
    width,
    height,
    seconds: total,
    withAudio,
    narratedCuts,
    formatLabel: formats.label,
  };
}
