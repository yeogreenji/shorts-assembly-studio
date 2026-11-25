import type { VoicePreset } from './tts';

/**
 * 오디오 믹서 — 배경음과 나레이션을 '한 그래프'에서 섞습니다.
 *
 *  · 미리보기: 스피커로 (monitor)
 *  · 영상 저장: MediaStreamAudioDestinationNode 하나로 (stream) → MediaRecorder가 그대로 녹음
 *
 * 두 소리가 같은 AudioContext·같은 시계를 쓰기 때문에 컷 시작 시각에 음성을 정확히 놓을 수 있고,
 * 음성이 나오는 동안 배경음을 자동으로 낮추는 덕킹(ducking)도 같은 곳에서 처리합니다.
 * 음성은 고역을 살짝 눌러 주고 중저역을 보강한 뒤 아주 짧은 방(room)을 더해,
 * 브라우저 TTS 특유의 '건조하고 로봇 같은' 느낌을 줄입니다.
 */

export interface Sink {
  ctx: AudioContext;
  out: AudioNode;
}

export interface VoicePlayOptions {
  /** 재생 배속(목소리 전체가 빨라집니다) */
  rate?: number;
  /** 음높이(센트). -120이면 한 반음쯤 낮게 — 배속과 함께 살짝 달라집니다 */
  tone?: number;
  /** 0~1 */
  gain?: number;
  /** 이 초만큼 건너뛰고 재생(컷 중간부터 재생할 때) */
  offset?: number;
  /** 낮은 톤 프리셋이 쓰는 저역 보강 */
  lowShelf?: number;
  /** 낮은 톤 프리셋이 쓰는 고역 정리 */
  lowpass?: number;
  /** 중저역 온기(dB) — 목소리에 몸통을 더합니다 */
  warmth?: number;
  /** 이 음성이 나오는 동안 배경음을 낮출지 */
  duck?: boolean;
  /** 이 시간을 넘기면 소리를 끊습니다(컷 끝을 넘겨 겹치지 않게) */
  maxSeconds?: number;
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

/** 아주 짧은 방 울림(0.55초, 지수 감쇠) — 목소리가 벽에 부딪힌 듯한 공기를 더합니다. */
function roomImpulse(ctx: AudioContext): AudioBuffer {
  const seconds = 0.55;
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const decay = Math.pow(1 - index / length, 3.2);
      data[index] = (Math.random() * 2 - 1) * decay * 0.5;
    }
  }
  return buffer;
}

export class AudioMixer {
  private ctx: AudioContext | null = null;
  private bgmBus: GainNode | null = null;
  private voiceBus: GainNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private closing = false;
  private reverb: ConvolverNode | null = null;
  /** 살아 있는 음성 소스 — 일시정지·이동 때 실제로 끊습니다(블록 음성이 길어도). */
  private voices = new Set<{ source: AudioBufferSourceNode; gain: GainNode }>();
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
      // 목소리 전용 방 울림 — 마른 소리를 조금 데웁니다.
      try {
        const convolver = ctx.createConvolver();
        convolver.buffer = roomImpulse(ctx);
        const wet = ctx.createGain();
        wet.gain.value = 0.055;
        convolver.connect(wet);
        wet.connect(voiceBus);
        this.reverb = convolver;
      } catch {
        this.reverb = null;
      }
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
    const tone = Math.max(-240, Math.min(240, options.tone ?? 0));
    const rate = Math.max(0.5, Math.min(2, (options.rate ?? 1) * preset.rate * Math.pow(2, tone / 1200)));
    const offset = Math.max(0, Math.min(buffer.duration - 0.01, options.offset ?? 0));
    const natural = Math.max(0.05, (buffer.duration - offset) / rate);
    const duration = Math.min(natural, Math.max(0.2, options.maxSeconds ?? natural));
    const when = Math.max(ctx.currentTime + 0.005, at ?? ctx.currentTime + 0.01);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    const gain = ctx.createGain();
    const target = Math.max(0, Math.min(1.5, options.gain ?? 1));
    gain.gain.value = target;

    let tail: AudioNode = gain;
    // 1) 70Hz 아래 럼블 정리 — 스피커에서 웅웅거리는 소리를 없앱니다.
    try {
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 70;
      highpass.Q.value = 0.6;
      tail.connect(highpass);
      tail = highpass;
    } catch {
      /* 필터를 못 만드는 환경 */
    }
    // 2) 말소리 존재감(2.6kHz) 아주 살짝 — 자막을 읽는 목소리가 또렷해집니다.
    try {
      const presence = ctx.createBiquadFilter();
      presence.type = 'peaking';
      presence.frequency.value = 2600;
      presence.Q.value = 0.9;
      presence.gain.value = 1.2;
      tail.connect(presence);
      tail = presence;
    } catch {
      /* 필터를 못 만드는 환경 */
    }
    // 3) 온기(중저역) — 화자 스타일마다 다릅니다.
    const warmth = options.warmth ?? 1.2;
    if (warmth > 0.05) {
      try {
        const body = ctx.createBiquadFilter();
        body.type = 'lowshelf';
        body.frequency.value = 260;
        body.gain.value = Math.min(4, warmth);
        tail.connect(body);
        tail = body;
      } catch {
        /* 필터를 못 만드는 환경 */
      }
    }
    if (options.lowpass && options.lowpass > 0) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = options.lowpass;
      tail.connect(filter);
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
    // 4) 말이 끝나는 순간 딱 끊기지 않게 아주 짧게 여운을 남깁니다.
    const hold = Math.max(0.05, duration - 0.05);
    gain.gain.setValueAtTime(target, when);
    gain.gain.setValueAtTime(target, when + hold);
    gain.gain.linearRampToValueAtTime(0.001, when + duration + 0.02);
    tail.connect(bus);
    if (this.reverb) tail.connect(this.reverb);
    source.connect(gain);
    source.start(when, offset);
    source.stop(when + duration + 0.04);

    const entry = { source, gain };
    this.voices.add(entry);
    source.onended = () => {
      this.voices.delete(entry);
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
  duck(at: number, until: number, depth = 0.3): void {
    const ctx = this.ctx;
    const bus = this.bgmBus;
    if (!ctx || !bus) return;
    const start = Math.max(ctx.currentTime, at - 0.14);
    const end = Math.max(start + 0.08, until + 0.22);
    if (start < this.duckingUntil - 0.02) {
      // 이미 낮아져 있는 구간에 다음 음성이 붙으면, 올렸다 내리지 않고 이어서 낮게 둡니다.
      bus.gain.setTargetAtTime(depth, start, 0.05);
      bus.gain.setTargetAtTime(1, end, 0.13);
    } else {
      bus.gain.setTargetAtTime(depth, start, 0.07);
      bus.gain.setTargetAtTime(1, end, 0.16);
    }
    this.duckingUntil = end;
    audioStats().ducks += 1;
  }

  /** 지금 나오는 음성을 실제로 끊습니다 — 일시정지·위치 이동·음소거. */
  stopVoices(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const at = ctx.currentTime;
    for (const entry of [...this.voices]) {
      try {
        entry.gain.gain.cancelScheduledValues(at);
        entry.gain.gain.setTargetAtTime(0.001, at, 0.012);
        entry.source.stop(at + 0.06);
      } catch {
        /* 이미 끝난 소스 */
      }
      this.voices.delete(entry);
    }
    this.duckingUntil = 0;
  }

  /** 미리보기에서 다른 소리를 잠깐 죽일 때(미리듣기 전환). */
  muteVoicesFor(ms = 250): void {
    const ctx = this.ctx;
    const bus = this.voiceBus;
    if (!ctx || !bus) return;
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
    bus.gain.setTargetAtTime(1, ctx.currentTime + ms / 1000, 0.04);
  }

  close(): void {
    this.closing = true;
    const ctx = this.ctx;
    this.ctx = null;
    this.bgmBus = null;
    this.voiceBus = null;
    this.dest = null;
    this.reverb = null;
    this.voices.clear();
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
