import type { ScenePlan } from './scene';
import { renderFrame } from './draw';
import { preloadArts } from './artLoader';
import type { MotionLevel } from './stage';

/** 모션 일러스트를 그대로 WebM 영상으로 녹화합니다. (서버·유료 API 없이 브라우저만 사용) */

export interface VideoExportOptions {
  onProgress?: (ratio: number) => void;
  /** 기기에서 합성한 비트를 넣을지 (저작권 걱정 없는 소리) */
  beat?: boolean;
  width?: number;
  height?: number;
  fps?: number;
  /** 미리보기와 같은 모션 강도 — 녹화 결과가 화면과 100% 같아집니다. */
  motion?: MotionLevel | number;
}

export interface VideoExportResult {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  seconds: number;
}

export function isVideoExportSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

function pickMime(): string | null {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      /* 다음 후보 */
    }
  }
  return null;
}

/** 짧은 비트 — 오실레이터로 그 자리에서 만듭니다. */
async function startBeat(duration: number): Promise<{ stream: MediaStream; stop: () => void } | null> {
  const AudioCtor =
    typeof window !== 'undefined'
      ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      : undefined;
  if (!AudioCtor) return null;
  try {
    const ctx = new AudioCtor();
    const destination = ctx.createMediaStreamDestination();
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(destination);

    const beat = 0.6;
    const start = ctx.currentTime + 0.06;
    const total = duration + 0.2;

    const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
    const noise = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noise.length; index += 1) noise[index] = Math.random() * 2 - 1;

    for (let time = 0; time < total; time += beat) {
      // 킥
      const kick = ctx.createOscillator();
      const kickGain = ctx.createGain();
      kick.type = 'sine';
      kick.frequency.setValueAtTime(132, start + time);
      kick.frequency.exponentialRampToValueAtTime(46, start + time + 0.16);
      kickGain.gain.setValueAtTime(0.5, start + time);
      kickGain.gain.exponentialRampToValueAtTime(0.001, start + time + 0.22);
      kick.connect(kickGain).connect(master);
      kick.start(start + time);
      kick.stop(start + time + 0.26);

      // 하이햇 (8분음표)
      const hat = ctx.createBufferSource();
      hat.buffer = noiseBuffer;
      const hatFilter = ctx.createBiquadFilter();
      hatFilter.type = 'highpass';
      hatFilter.frequency.value = 7200;
      const hatGain = ctx.createGain();
      hatGain.gain.setValueAtTime(0.12, start + time + beat / 2);
      hatGain.gain.exponentialRampToValueAtTime(0.001, start + time + beat / 2 + 0.06);
      hat.connect(hatFilter).connect(hatGain).connect(master);
      hat.start(start + time + beat / 2);
      hat.stop(start + time + beat / 2 + 0.1);

      // 베이스
      const bass = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bass.type = 'triangle';
      bass.frequency.value = [55, 65.4, 49, 58.3][Math.round(time / beat) % 4] ?? 55;
      bassGain.gain.setValueAtTime(0.16, start + time);
      bassGain.gain.exponentialRampToValueAtTime(0.001, start + time + beat * 0.9);
      bass.connect(bassGain).connect(master);
      bass.start(start + time);
      bass.stop(start + time + beat * 0.95);
    }

    let failed = false;
    ctx.addEventListener?.('error', () => {
      failed = true;
    });
    await ctx.resume().catch(() => {
      failed = true;
    });
    // 오디오 장치가 없는 환경(일부 헤드리스 브라우저)에서는 소리 없이 영상만 기록합니다.
    await new Promise((resolve) => setTimeout(resolve, 80));
    if (failed || ctx.state !== 'running') {
      try {
        void ctx.close();
      } catch {
        /* 이미 닫힘 */
      }
      return null;
    }
    return {
      stream: destination.stream,
      stop: () => {
        try {
          void ctx.close();
        } catch {
          /* 이미 닫힘 */
        }
      },
    };
  } catch {
    return null;
  }
}

export async function exportVideo(plan: ScenePlan, options: VideoExportOptions = {}): Promise<VideoExportResult> {
  if (!isVideoExportSupported()) throw new Error('이 브라우저는 영상 녹화를 지원하지 않습니다. 크롬·엣지에서 다시 시도해 주세요.');
  const mimeType = pickMime();
  if (!mimeType) throw new Error('이 브라우저에서 쓸 수 있는 영상 형식이 없습니다.');

  // 일러스트와 웹폰트가 준비된 뒤에 녹화를 시작합니다 — 빈 배경이 찍히지 않게.
  await preloadArts(plan.cuts.map((cut) => cut.art.id));
  try {
    await document.fonts?.ready;
  } catch {
    /* 폰트 로딩을 기다릴 수 없는 브라우저 */
  }

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
  const beat = options.beat === false ? null : await startBeat(total);
  if (beat) {
    for (const track of beat.stream.getAudioTracks()) stream.addTrack(track);
  }

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 5_500_000,
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

  renderFrame(canvas, plan, 0, { captions: true, hud: true, motion: options.motion });
  videoTrack?.requestFrame?.();
  recorder.start(250);
  const startedAt = performance.now();

  await new Promise<void>((resolve) => {
    const loop = () => {
      const elapsed = (performance.now() - startedAt) / 1000;
      const at = Math.min(total, elapsed);
      renderFrame(canvas, plan, at, { captions: true, hud: true, motion: options.motion });
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

  recorder.stop();
  // 오디오 장치가 없는 환경에서도 녹화가 멈추지 않게 안전장치를 둡니다.
  await Promise.race([finished, new Promise<void>((resolve) => setTimeout(resolve, 4000))]);
  beat?.stop();
  for (const track of stream.getTracks()) track.stop();

  const blob = new Blob(chunks, { type: mimeType.split(';')[0] });
  if (blob.size === 0) throw new Error('녹화된 영상이 비어 있습니다. 다시 시도해 주세요.');
  return { blob, mimeType, width, height, seconds: total };
}
