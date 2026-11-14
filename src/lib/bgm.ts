import type { BgmMood } from '../types';

interface MoodConfig {
  bpm: number;
  /** 반마디 기준 코드 진행 (A3 기준 반음) */
  chords: number[][];
  padWave: OscillatorType;
  pluckWave: OscillatorType;
  filterHz: number;
  kick: boolean;
  arp: boolean;
  padGain: number;
}

const A3 = 220;

const CONFIG: Record<Exclude<BgmMood, 'none'>, MoodConfig> = {
  calm: {
    bpm: 68,
    chords: [
      [0, 3, 7],
      [-2, 3, 5],
      [-4, 0, 3],
      [-5, -1, 2],
    ],
    padWave: 'sine',
    pluckWave: 'sine',
    filterHz: 1200,
    kick: false,
    arp: true,
    padGain: 0.16,
  },
  upbeat: {
    bpm: 118,
    chords: [
      [0, 4, 7],
      [5, 9, 12],
      [7, 11, 14],
      [3, 7, 10],
    ],
    padWave: 'triangle',
    pluckWave: 'square',
    filterHz: 2600,
    kick: true,
    arp: true,
    padGain: 0.12,
  },
  playful: {
    bpm: 104,
    chords: [
      [0, 4, 7],
      [2, 5, 9],
      [4, 7, 11],
      [0, 5, 7],
    ],
    padWave: 'triangle',
    pluckWave: 'triangle',
    filterHz: 3200,
    kick: true,
    arp: true,
    padGain: 0.1,
  },
  tense: {
    bpm: 76,
    chords: [
      [0, 1, 7],
      [0, 1, 6],
      [-1, 0, 6],
      [0, 1, 7],
    ],
    padWave: 'sawtooth',
    pluckWave: 'sawtooth',
    filterHz: 700,
    kick: false,
    arp: false,
    padGain: 0.13,
  },
};

function midiToFreq(base: number, semitones: number): number {
  return base * Math.pow(2, semitones / 12);
}

export class BgmPlayer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private config: MoodConfig | null = null;

  get playing(): boolean {
    return this.ctx !== null;
  }

  start(mood: BgmMood, volume: number): void {
    this.stop();
    if (mood === 'none' || typeof window === 'undefined') return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = Math.max(0, Math.min(1, volume)) * 0.55;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = CONFIG[mood].filterHz;
    master.connect(filter);
    filter.connect(ctx.destination);

    this.ctx = ctx;
    this.master = master;
    this.config = CONFIG[mood];
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
    void ctx.resume();
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  setVolume(volume: number): void {
    if (!this.master || !this.ctx) return;
    this.master.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)) * 0.55, this.ctx.currentTime, 0.05);
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    if (this.ctx) {
      const ctx = this.ctx;
      const master = this.master;
      if (master) {
        master.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
      }
      window.setTimeout(() => {
        void ctx.close().catch(() => undefined);
      }, 220);
    }
    this.ctx = null;
    this.master = null;
    this.config = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    const config = this.config;
    if (!ctx || !config) return;
    const beat = 60 / config.bpm;

    while (this.nextTime < ctx.currentTime + 0.3) {
      const bar = Math.floor(this.step / 8) % config.chords.length;
      const chord = config.chords[bar] ?? config.chords[0] ?? [0, 4, 7];
      const inBar = this.step % 8;

      if (inBar === 0) {
        this.pad(ctx, chord, this.nextTime, beat * 4, config);
      }
      if (config.kick && (inBar === 0 || inBar === 4)) {
        this.kick(ctx, this.nextTime);
      }
      if (config.arp) {
        const note = chord[this.step % chord.length] ?? 0;
        if (inBar % 2 === 0) {
          this.pluck(ctx, midiToFreq(A3 * 2, note + 12), this.nextTime, config);
        }
      }
      this.step += 1;
      this.nextTime += beat / 2;
    }
  }

  private pad(ctx: AudioContext, chord: number[], at: number, length: number, config: MoodConfig): void {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(config.padGain, at + length * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length * 1.05);
    gain.connect(this.master as GainNode);

    chord.forEach((semi, index) => {
      const osc = ctx.createOscillator();
      // 렌더러(Python)와 같은 대역감을 내도록 살짝 디튠
      osc.type = config.padWave;
      osc.frequency.setValueAtTime(midiToFreq(A3, semi), at);
      osc.detune.setValueAtTime(index === 1 ? 6 : -4, at);
      osc.connect(gain);
      osc.start(at);
      osc.stop(at + length * 1.1);
    });
  }

  private pluck(ctx: AudioContext, freq: number, at: number, config: MoodConfig): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = config.pluckWave;
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.05, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.connect(gain);
    gain.connect(this.master as GainNode);
    osc.start(at);
    osc.stop(at + 0.3);
  }

  private kick(ctx: AudioContext, at: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.16);
    gain.gain.setValueAtTime(0.16, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    osc.connect(gain);
    gain.connect(this.master as GainNode);
    osc.start(at);
    osc.stop(at + 0.24);
  }
}

export const bgmPlayer = new BgmPlayer();
