import type { VoicePreset } from './tts';

/**
 * 오디오 믹서 — 배경음과 나레이션을 '한 그래프'에서 섞습니다.
 *
 *  · 미리보기: 스피커로 (monitor)
 *  · 영상 저장: MediaStreamAudioDestinationNode 하나로 (stream) → MediaRecorder가 그대로 녹음
 *
 * 두 소리가 같은 AudioContext·같은 시계를 쓰기 때문에 컷 시작 시각에 음성을 정확히 놓을 수 있고,
 * 음성이 나오는 동안 배경음을 자동으로 낮추는 덕킹(ducking)도 같은 곳에서 처리합니다.
 */

export interface Sink {
  ctx: AudioContext;
  out: AudioNode;
}

export interface VoicePlayOptions {
  /** 재생 배속(피치도 같이 올라갑니다 — 숏폼 톤) */
  rate?: number;
  /** 0~1 */
  gain?: number;
  /** 이 초만큼 건너뛰고 재생(컷 중간부터 재생할 때) */
  offset?: number;
  /** 낮은 톤 프리셋이 쓰는 저역 보강 */
  lowShelf?: number;
  /** 낮은 톤 프리셋이 쓰는 고역 정리 */
  lowpass?: number;
  /** 이 음성이 나오는 동안 배경음을 낮출지 */
  duck?: boolean;
}

export interface VoicePlayback {
  /** 재생이 끝나는 절대 시각(AudioContext 시계) */
  end: number;
  /** 실제로 들리는 길이(초) */
  duration: number;
  source: AudioBufferSourceNode;
}

/** 검증용 계수 — 미리보기·영상 저장에서 음성이 실제로 몇 번 섞였는지 셉니다. */
function audioStats(): { voices: number; ducks: number; lastVoiceAt: number } {
  if (typeof window === 'undefined') return { voices: 0, ducks: 0, lastVoiceAt: 0 };
  const holder = window as unknown as { __shortcutAudio?: { voices: number; ducks: number; lastVoiceAt: number } };
  holder.__shortcutAudio ??= { voices: 0, ducks: 0, lastVoiceAt: 0 };
  return holder.__shortcutAudio;
}

function audioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

export class AudioMixer {
  private ctx: AudioContext | null = null;
  private bgmBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private closing = false;
  /** 덕킹이 걸렸다 풀리는 중인지 — 연속 컷에서 배경음이 다시 올라오지 않게 합니다. */
  private duckingUntil = 0;

  constructor(private readonly options: { stream?: boolean; monitor?: boolean } = {}) {}

  get context(): AudioContext | null {
    return this.ctx;
  }

  get stream(): MediaStream | null {
    return this.dest?.stream ?? null;
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** 배경음 엔진이 붙을 자리 — 아직 만들지 않았으면 여기서 만듭니다. */
  sink(): Sink | null {
    const ctx = this.ensure();
    if (!ctx || !this.bgmBus) return null;
    return { ctx, out: this.bgmBus };
  }

  ensure(): AudioContext | null {
    if (this.closing) return null;
    if (this.ctx) return this.ctx;
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 1;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 20;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.22;
      const bgmBus = ctx.createGain();
      const voiceBus = ctx.createGain();
      bgmBus.connect(master);
      voiceBus.connect(master);
      master.connect(compressor);
      if (this.options.stream) {
        const dest = ctx.createMediaStreamDestination();
        compressor.connect(dest);
        this.dest = dest;
      }
      if (this.options.monitor !== false) compressor.connect(ctx.destination);
      this.ctx = ctx;
      this.bgmBus = bgmBus;
      this.voiceBus = voiceBus;
      return ctx;
    } catch {
      return null;
    }
  }

  async resume(): Promise<boolean> {
    const ctx = this.ensure();
    if (!ctx) return false;
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        /* 오디오 장치가 없는 환경 */
      }
    }
    return ctx.state === 'running';
  }

  setBgmLevel(level: number): void {
    const ctx = this.ctx;
    const bus = this.bgmBus;
    if (!ctx || !bus) return;
    bus.gain.setTargetAtTime(Math.max(0, Math.min(1, level)), ctx.currentTime, 0.05);
  }

  /**
   * 음성 — 시작 시각(at)에 맞춰 버퍼를 놓습니다. at을 주지 않으면 지금 바로.
   * 같은 시계를 쓰는 배경음 위에 정확히 얹히고, duck이면 그 구간만 배경음을 낮춥니다.
   */
  playVoice(buffer: AudioBuffer, preset: VoicePreset, at?: number, options: VoicePlayOptions = {}): VoicePlayback | null {
    const ctx = this.ensure();
    const bus = this.voiceBus;
    if (!ctx || !bus) return null;
    const rate = Math.max(0.5, Math.min(2, (options.rate ?? 1) * preset.rate));
    const offset = Math.max(0, Math.min(buffer.duration - 0.01, options.offset ?? 0));
    const duration = Math.max(0.05, (buffer.duration - offset) / rate);
    const when = Math.max(ctx.currentTime + 0.005, at ?? ctx.currentTime + 0.01);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1.5, options.gain ?? 1));

    let tail: AudioNode = gain;
    if (options.lowpass && options.lowpass > 0) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = options.lowpass;
      gain.connect(filter);
      tail = filter;
    }
    if (options.lowShelf && options.lowShelf > 0) {
      const shelf = ctx.createBiquadFilter();
      shelf.type = 'lowshelf';
      shelf.frequency.value = 220;
      shelf.gain.value = options.lowShelf;
      tail.connect(shelf);
      tail = shelf;
    }
    // 말이 끝나는 순간 딱 끊기지 않게 아주 짧게 여운을 남깁니다.
    gain.gain.setValueAtTime(gain.gain.value, when);
    gain.gain.setValueAtTime(gain.gain.value, when + Math.max(0.05, duration - 0.04));
    tail.connect(bus);
    source.connect(gain);
    source.start(when, offset);
    source.stop(when + duration + 0.02);
    source.onended = () => {
      try {
        source.disconnect();
        gain.disconnect();
      } catch {
        /* 이미 끊김 */
      }
    };

    const stats = audioStats();
    stats.voices += 1;
    stats.lastVoiceAt = when;
    if (options.duck !== false) this.duck(when, when + duration);
    return { end: when + duration, duration, source };
  }

  /** at~until 동안 배경음을 낮춥니다(음성 구간). 앞뒤로 120ms 페이드. */
  duck(at: number, until: number, depth = 0.32): void {
    const ctx = this.ctx;
    const bus = this.bgmBus;
    if (!ctx || !bus) return;
    const start = Math.max(ctx.currentTime, at - 0.12);
    const end = Math.max(start + 0.08, until + 0.16);
    if (start < this.duckingUntil - 0.02) {
      // 이미 낮아져 있는 구간에 다음 음성이 붙으면, 올렸다 내리지 않고 이어서 낮게 둡니다.
      bus.gain.setTargetAtTime(depth, start, 0.05);
      bus.gain.setTargetAtTime(1, end, 0.12);
    } else {
      bus.gain.setTargetAtTime(depth, start, 0.06);
      bus.gain.setTargetAtTime(1, end, 0.14);
    }
    this.duckingUntil = end;
    audioStats().ducks += 1;
  }

  stopVoices(): void {
    // 소스 노드는 스스로 끝나므로 버스만 잠깐 음소거했다 되돌립니다.
    const ctx = this.ctx;
    const bus = this.voiceBus;
    if (!ctx || !bus) return;
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
    bus.gain.setTargetAtTime(1, ctx.currentTime + 0.25, 0.04);
  }

  close(): void {
    this.closing = true;
    const ctx = this.ctx;
    this.ctx = null;
    this.bgmBus = null;
    this.voiceBus = null;
    this.dest = null;
    if (ctx) {
      try {
        void ctx.close();
      } catch {
        /* 이미 닫힘 */
      }
    }
  }
}

/** 미리보기용 — 앱 전체가 하나를 나눠 씁니다(배경음·나레이션이 같은 시계). */
export const previewMix = new AudioMixer({ monitor: true });
