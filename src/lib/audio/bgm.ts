import type { AudioSettings, BgmMood } from '../../types';
import { AudioMixer, previewMix, type Sink } from './mixer';

/**
 * 저작권 걱정 없는 배경음 — 브라우저 안에서 그 자리에서 합성합니다.
 * (음원 파일도, 외부 API도 쓰지 않으므로 어떤 영상에 붙여도 라이선스 문제가 없습니다)
 *
 *  · 무드 4종(트렌디·로맨스·긴장·코믹)을 코드 진행·드럼·베이스·아르페지오로 조합
 *  · 미리보기와 영상 녹화가 '같은 점수(score)'를 쓰므로 결과물의 비트가 화면과 맞습니다
 *  · 컷이 바뀔 때 휙 넘어가는 효과음(accents)까지 같은 경로로 섞입니다
 *  · AudioMixer의 배경음 버스로 보내면 나레이션이 나오는 동안 자동으로 낮아집니다(덕킹)
 */

export type Voice = 'kick' | 'snare' | 'hat' | 'open' | 'bass' | 'pluck' | 'pad' | 'bell' | 'whoosh';

export interface Note {
  at: number;
  dur: number;
  freq: number;
  gain: number;
  voice: Voice;
}

type ChordType = 'min' | 'maj' | 'sus';

export interface MoodDef {
  id: Exclude<BgmMood, 'off'>;
  label: string;
  hint: string;
  bpm: number;
  /** 기준음(MIDI). 57 = A3 */
  root: number;
  progression: { root: number; type: ChordType }[];
  /** 한 마디 안의 박 위치(4박 기준) */
  kick: number[];
  snare: number[];
  hat: number[];
  bass: 'long' | 'pulse' | 'walk';
  arp: 'none' | 'up' | 'broken' | 'stab';
  pad: 'none' | 'warm' | 'strings';
  lead: 'none' | 'bell' | 'flute';
  /** 장단조 느낌의 멜로디 음계 */
  scale: number[];
}

export const MOODS: MoodDef[] = [
  {
    id: 'trendy',
    label: '트렌디 비트',
    hint: '숏폼 기본 — 또렷한 킥과 8비트 베이스',
    bpm: 120,
    root: 57,
    progression: [
      { root: 0, type: 'min' },
      { root: 8, type: 'maj' },
      { root: 3, type: 'maj' },
      { root: 10, type: 'maj' },
    ],
    kick: [0, 1.5, 2],
    snare: [1, 3],
    hat: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
    bass: 'pulse',
    arp: 'up',
    pad: 'warm',
    lead: 'none',
    scale: [0, 2, 3, 5, 7, 8, 10],
  },
  {
    id: 'romance',
    label: '로맨스',
    hint: '느린 피아노 같은 아르페지오와 따뜻한 패드',
    bpm: 76,
    root: 60,
    progression: [
      { root: 0, type: 'maj' },
      { root: 7, type: 'maj' },
      { root: 9, type: 'min' },
      { root: 5, type: 'maj' },
    ],
    kick: [0, 2],
    snare: [],
    hat: [],
    bass: 'long',
    arp: 'broken',
    pad: 'strings',
    lead: 'bell',
    scale: [0, 2, 4, 5, 7, 9, 11],
  },
  {
    id: 'tension',
    label: '긴장 · 드라마',
    hint: '낮게 깔리는 드론과 느린 심장 박동',
    bpm: 96,
    root: 50,
    progression: [
      { root: 0, type: 'min' },
      { root: 1, type: 'sus' },
      { root: 8, type: 'maj' },
      { root: 0, type: 'min' },
    ],
    kick: [0, 2.5],
    snare: [2, 3.5],
    hat: [0.5, 1.5, 2.5, 3.5],
    bass: 'pulse',
    arp: 'none',
    pad: 'strings',
    lead: 'flute',
    scale: [0, 2, 3, 5, 7, 8, 11],
  },
  {
    id: 'comic',
    label: '코믹 · 경쾌',
    hint: '통통 튀는 베이스와 장난스러운 벨',
    bpm: 132,
    root: 67,
    progression: [
      { root: 0, type: 'maj' },
      { root: 5, type: 'maj' },
      { root: 9, type: 'min' },
      { root: 7, type: 'maj' },
    ],
    kick: [0, 2],
    snare: [1, 3],
    hat: [0.5, 1.5, 2.5, 3.5],
    bass: 'walk',
    arp: 'stab',
    pad: 'none',
    lead: 'bell',
    scale: [0, 2, 4, 7, 9, 11, 12],
  },
];

export const MOOD_LIST: { id: BgmMood; label: string; hint: string }[] = [
  { id: 'off', label: '무음', hint: '배경음 없이 영상만' },
  ...MOODS.map((mood) => ({ id: mood.id as BgmMood, label: mood.label, hint: mood.hint })),
];

export function moodOf(id: BgmMood): MoodDef | null {
  return MOODS.find((mood) => mood.id === id) ?? null;
}

const CHORDS: Record<ChordType, number[]> = {
  min: [0, 3, 7, 10],
  maj: [0, 4, 7, 11],
  sus: [0, 5, 7, 10],
};

const midiToFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

function seededOrder(seed: number): () => number {
  let value = seed || 1;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

/** 무드 하나를 초 단위로 펼친 악보 — 같은 무드·같은 길이면 항상 같은 소리. */
export function buildScore(mood: MoodDef, seconds: number): Note[] {
  const beat = 60 / mood.bpm;
  const barLen = beat * 4;
  const bars = Math.max(1, Math.ceil(Math.max(1, seconds) / barLen) + 1);
  const notes: Note[] = [];
  const rand = seededOrder(mood.root * 977 + mood.bpm);

  for (let bar = 0; bar < bars; bar += 1) {
    const t0 = bar * barLen;
    const prog = mood.progression[bar % mood.progression.length];
    const base = mood.root + prog.root;
    const chord = CHORDS[prog.type].map((interval) => base + interval);

    // 패드 — 마디를 길게 채우는 화음
    if (mood.pad !== 'none') {
      const gain = mood.pad === 'strings' ? 0.05 : 0.036;
      for (const note of chord.slice(0, 3)) {
        notes.push({ at: t0, dur: barLen * 0.97, freq: midiToFreq(note), gain, voice: 'pad' });
      }
    }

    // 베이스
    if (mood.bass === 'long') {
      notes.push({ at: t0, dur: barLen * 0.9, freq: midiToFreq(base - 12), gain: 0.3, voice: 'bass' });
    } else if (mood.bass === 'pulse') {
      for (let step = 0; step < 8; step += 1) {
        const octave = step % 4 === 3 ? 12 : 0;
        notes.push({
          at: t0 + step * beat * 0.5,
          dur: beat * 0.42,
          freq: midiToFreq(base - 12 + octave),
          gain: 0.25,
          voice: 'bass',
        });
      }
    } else {
      for (let step = 0; step < 4; step += 1) {
        const offset = chord[step % 3] - base;
        notes.push({
          at: t0 + step * beat,
          dur: beat * 0.8,
          freq: midiToFreq(base - 12 + offset),
          gain: 0.22,
          voice: 'bass',
        });
      }
    }

    // 드럼
    for (const at of mood.kick) notes.push({ at: t0 + at * beat, dur: 0.22, freq: 52, gain: 0.85, voice: 'kick' });
    for (const at of mood.snare) notes.push({ at: t0 + at * beat, dur: 0.16, freq: 190, gain: 0.26, voice: 'snare' });
    mood.hat.forEach((at, index) => {
      const accent = index % 2 === 0 ? 1 : 0.62;
      notes.push({ at: t0 + at * beat, dur: 0.05, freq: 8200, gain: 0.1 * accent, voice: 'hat' });
    });

    // 아르페지오·스타브
    if (mood.arp === 'up') {
      for (let step = 0; step < 16; step += 1) {
        const note = chord[step % chord.length] + 12;
        notes.push({ at: t0 + step * beat * 0.25, dur: 0.14, freq: midiToFreq(note), gain: 0.04, voice: 'pluck' });
      }
    } else if (mood.arp === 'broken') {
      const pattern = [0, 2, 1, 2, 0, 3, 1, 2];
      pattern.forEach((index, step) => {
        notes.push({
          at: t0 + step * beat * 0.5,
          dur: 0.34,
          freq: midiToFreq(chord[index % chord.length] + 12),
          gain: 0.055,
          voice: 'pluck',
        });
      });
    } else if (mood.arp === 'stab') {
      for (const at of [1.5, 3.5]) {
        for (const note of chord.slice(0, 3)) {
          notes.push({ at: t0 + at * beat, dur: 0.16, freq: midiToFreq(note + 12), gain: 0.045, voice: 'pluck' });
        }
      }
    }

    // 멜로디 — 아주 조금만, 반복되지 않게
    if (mood.lead === 'bell') {
      const picks = [2.5, 3.25];
      picks.forEach((at, index) => {
        if (rand() < 0.35) return;
        const degree = mood.scale[Math.floor(rand() * mood.scale.length)];
        notes.push({
          at: t0 + at * beat,
          dur: 0.6,
          freq: midiToFreq(base + 12 + degree),
          gain: 0.075 + index * 0.01,
          voice: 'bell',
        });
      });
    } else if (mood.lead === 'flute') {
      const degree = mood.scale[(bar * 2) % mood.scale.length];
      notes.push({ at: t0 + beat * 0.5, dur: beat * 2.4, freq: midiToFreq(base + 12 + degree), gain: 0.05, voice: 'bell' });
    }
  }

  return notes.filter((note) => note.at < seconds).sort((a, b) => a.at - b.at);
}

/** 컷이 바뀔 때 — 짧게 훑고 지나가는 효과음. */
export function accentNotes(cutStarts: number[]): Note[] {
  return cutStarts
    .filter((at) => at > 0.05)
    .map((at) => ({ at, dur: 0.4, freq: 900, gain: 0.3, voice: 'whoosh' as Voice }));
}

export interface StartOptions {
  mood: BgmMood;
  volume: number;
  muted: boolean;
  accents: boolean;
  total: number;
  cutStarts: number[];
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.2), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * 배경음 재생기 — 미리보기와 영상 녹화가 같은 클래스를 씁니다.
 * 소리는 주입받은 AudioMixer의 배경음 버스로만 나가므로, 나레이션 덕킹과 한 그래프에서 섞입니다.
 */
export class BgmEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private bus: GainNode | null = null;
  private send: GainNode | null = null;
  /** 이번 재생에서 만든 노드들 — 멈출 때 함께 끊어 오디오 그래프가 쌓이지 않게 합니다. */
  private chain: AudioNode[] = [];
  private notes: Note[] = [];
  private sources = new Set<AudioScheduledSourceNode>();
  private timer: number | null = null;
  private anchor = 0;
  private from = 0;
  private cursor = 0;
  private volume = 0.45;
  private muted = false;
  private disposed = false;
  /** 재생 요청이 겹칠 때(빠르게 무드를 바꿀 때) 늦게 끝난 요청이 이기지 않도록 하는 세대 번호 */
  private generation = 0;

  constructor(private readonly sink: () => Sink | null) {}

  /** 이번 재생에서 0초가 놓인 AudioContext 시각 — 나레이션을 같은 지점에 맞춥니다. */
  get startTime(): number {
    return this.anchor;
  }

  private ensure(): AudioContext | null {
    if (this.disposed) return null;
    if (this.ctx) return this.ctx;
    const host = this.sink();
    if (!host) return null;
    try {
      const ctx = host.ctx;
      const master = ctx.createGain();
      master.gain.value = this.muted ? 0 : this.volume;
      master.connect(host.out);
      this.ctx = ctx;
      this.master = master;
      this.noise = makeNoise(ctx);
      return ctx;
    } catch {
      return null;
    }
  }

  /** at초부터 재생을 시작합니다. 소리를 실제로 켰는지 돌려줍니다. */
  async start(at: number, options: StartOptions): Promise<boolean> {
    const generation = (this.generation += 1);
    this.volume = Math.max(0, Math.min(1, options.volume));
    this.muted = options.muted;
    const def = moodOf(options.mood);
    if (!def || options.muted) {
      this.stop();
      return false;
    }
    const ctx = this.ensure();
    if (!ctx) return false;
    try {
      if (ctx.state !== 'running') await ctx.resume();
    } catch {
      /* 오디오 장치가 없는 환경 */
    }
    if (generation !== this.generation) return false;
    if (ctx.state !== 'running') return false;

    this.stop(false);

    this.notes = buildScore(def, Math.max(4, options.total));
    if (options.accents) {
      this.notes = [...this.notes, ...accentNotes(options.cutStarts)].sort((a, b) => a.at - b.at);
    }
    this.from = Math.max(0, at);
    this.anchor = ctx.currentTime + 0.08;
    this.cursor = 0;
    while (this.cursor < this.notes.length && this.notes[this.cursor].at < this.from) this.cursor += 1;

    const master = this.master;
    if (!master) return false;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.25);
    bus.connect(master);

    // 짧은 딜레이 — 벨·플럭에 공간감만 살짝
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.26;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.26;
    const wet = ctx.createGain();
    wet.gain.value = 0.2;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2400;
    const send = ctx.createGain();
    send.gain.value = 1;
    send.connect(delay);
    delay.connect(tone);
    tone.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(master);

    this.bus = bus;
    this.send = send;
    this.chain = [bus, delay, feedback, wet, tone, send];
    master.gain.setTargetAtTime(this.muted ? 0 : this.volume, ctx.currentTime, 0.03);

    this.tick();
    this.timer = window.setInterval(() => this.tick(), 90);
    return true;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyGain();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyGain();
  }

  private applyGain(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    master.gain.setTargetAtTime(this.muted ? 0 : this.volume, ctx.currentTime, 0.04);
  }

  get playing(): boolean {
    return this.timer !== null;
  }

  /** 예약된 소리를 모두 끄고(짧게 페이드아웃) 스케줄러를 멈춥니다. */
  stop(fade = true): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    const ctx = this.ctx;
    const bus = this.bus;
    if (ctx && bus) {
      const now = ctx.currentTime;
      try {
        bus.gain.cancelScheduledValues(now);
        bus.gain.setValueAtTime(bus.gain.value, now);
        bus.gain.linearRampToValueAtTime(0, now + (fade ? 0.09 : 0.005));
      } catch {
        /* 이미 닫힌 컨텍스트 */
      }
      const stopAt = now + (fade ? 0.12 : 0.01);
      for (const source of this.sources) {
        try {
          source.stop(stopAt);
        } catch {
          /* 이미 멈춘 소리 */
        }
      }
    }
    this.sources.clear();
    this.bus = null;
    this.send = null;
    this.notes = [];
    this.cursor = 0;
    // 페이드아웃이 끝난 뒤 이번 재생의 노드를 모두 끊습니다(그래프 누적 방지).
    const chain = this.chain;
    this.chain = [];
    if (chain.length) {
      window.setTimeout(() => {
        for (const node of chain) {
          try {
            node.disconnect();
          } catch {
            /* 이미 끊김 */
          }
        }
      }, fade ? 220 : 0);
    }
  }

  dispose(): void {
    this.stop(false);
    this.disposed = true;
    // AudioContext는 믹서가 소유합니다 — 여기서는 이 엔진의 노드만 떼어 냅니다.
    try {
      this.master?.disconnect();
    } catch {
      /* 이미 끊김 */
    }
    this.ctx = null;
    this.master = null;
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    const position = this.from + (ctx.currentTime - this.anchor);
    const horizon = position + 0.6;
    while (this.cursor < this.notes.length && this.notes[this.cursor].at <= horizon) {
      const note = this.notes[this.cursor];
      const when = this.anchor + (note.at - this.from);
      this.cursor += 1;
      if (when < ctx.currentTime - 0.05) continue;
      this.play(note, Math.max(when, ctx.currentTime + 0.004));
    }
  }

  private track(source: AudioScheduledSourceNode): void {
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      try {
        source.disconnect();
      } catch {
        /* 이미 끊김 */
      }
    };
  }

  private play(note: Note, when: number): void {
    const ctx = this.ctx;
    const bus = this.bus;
    const noise = this.noise;
    if (!ctx || !bus) return;
    const end = when + note.dur;

    const osc = (type: OscillatorType, freq: number): OscillatorNode => {
      const node = ctx.createOscillator();
      node.type = type;
      node.frequency.setValueAtTime(freq, when);
      return node;
    };

    switch (note.voice) {
      case 'kick': {
        const node = osc('sine', 148);
        node.frequency.exponentialRampToValueAtTime(44, when + 0.14);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(note.gain, when + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0005, when + note.dur);
        node.connect(gain).connect(bus);
        node.start(when);
        node.stop(end + 0.02);
        this.track(node);
        break;
      }
      case 'snare': {
        if (!noise) return;
        const source = ctx.createBufferSource();
        source.buffer = noise;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1850;
        filter.Q.value = 0.7;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(note.gain, when);
        gain.gain.exponentialRampToValueAtTime(0.0005, when + note.dur);
        source.connect(filter).connect(gain).connect(bus);
        source.start(when, Math.random() * 0.5, note.dur + 0.05);
        this.track(source);
        break;
      }
      case 'hat':
      case 'open': {
        if (!noise) return;
        const source = ctx.createBufferSource();
        source.buffer = noise;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = note.voice === 'open' ? 6400 : 8600;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(note.gain, when + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0004, when + note.dur);
        source.connect(filter).connect(gain).connect(bus);
        source.start(when, Math.random() * 0.5, note.dur + 0.03);
        this.track(source);
        break;
      }
      case 'bass': {
        const node = osc('triangle', note.freq);
        const sub = osc('sine', note.freq / 2);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(620, when);
        filter.Q.value = 2;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(note.gain, when + 0.012);
        gain.gain.setTargetAtTime(note.gain * 0.5, when + 0.02, 0.16);
        gain.gain.exponentialRampToValueAtTime(0.0006, when + note.dur + 0.12);
        node.connect(filter);
        sub.connect(filter);
        filter.connect(gain).connect(bus);
        node.start(when);
        sub.start(when);
        node.stop(end + 0.16);
        sub.stop(end + 0.16);
        this.track(node);
        this.track(sub);
        break;
      }
      case 'pad': {
        const a = osc('sawtooth', note.freq);
        const b = osc('sawtooth', note.freq * 1.0035);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(900, when);
        filter.frequency.linearRampToValueAtTime(1600, when + note.dur * 0.6);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(note.gain, when + Math.min(0.6, note.dur * 0.35));
        gain.gain.setValueAtTime(note.gain, when + note.dur * 0.72);
        gain.gain.linearRampToValueAtTime(0, when + note.dur);
        a.connect(filter);
        b.connect(filter);
        filter.connect(gain).connect(bus);
        a.start(when);
        b.start(when);
        a.stop(end + 0.05);
        b.stop(end + 0.05);
        this.track(a);
        this.track(b);
        break;
      }
      case 'pluck': {
        const node = osc('triangle', note.freq);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(note.gain, when + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0005, when + Math.max(0.12, note.dur));
        node.connect(gain).connect(bus);
        if (this.send) gain.connect(this.send);
        node.start(when);
        node.stop(end + 0.05);
        this.track(node);
        break;
      }
      case 'bell': {
        const lead = osc('sine', note.freq);
        const overtone = osc('sine', note.freq * 2.01);
        const overtoneGain = ctx.createGain();
        overtoneGain.gain.value = 0.22;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(note.gain, when + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0005, when + note.dur);
        lead.connect(gain);
        overtone.connect(overtoneGain).connect(gain);
        gain.connect(bus);
        if (this.send) gain.connect(this.send);
        lead.start(when);
        overtone.start(when);
        lead.stop(end + 0.05);
        overtone.stop(end + 0.05);
        this.track(lead);
        this.track(overtone);
        break;
      }
      case 'whoosh':
      default: {
        if (!noise) return;
        const source = ctx.createBufferSource();
        source.buffer = noise;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 1.4;
        filter.frequency.setValueAtTime(420, when);
        filter.frequency.exponentialRampToValueAtTime(4200, when + note.dur * 0.55);
        filter.frequency.exponentialRampToValueAtTime(760, when + note.dur);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(note.gain, when + note.dur * 0.35);
        gain.gain.exponentialRampToValueAtTime(0.0004, when + note.dur);
        source.connect(filter).connect(gain).connect(bus);
        source.start(when, Math.random() * 0.4, note.dur + 0.05);
        this.track(source);
        break;
      }
    }
  }
}

/** 미리보기용 — 앱 전체가 하나를 나눠 씁니다(나레이션과 같은 믹서). */
export const previewBgm = new BgmEngine(() => previewMix.sink());

/** 미리듣기 전용 — 지금 재생 중인 배경음을 건드리지 않습니다. */
let audition: { mix: AudioMixer; engine: BgmEngine } | null = null;

/** 지금 설정으로 몇 초만 들려주는 미리듣기. */
export function previewMood(settings: AudioSettings, seconds = 5): void {
  audition?.engine.dispose();
  audition?.mix.close();
  const mix = new AudioMixer({ monitor: true });
  const engine = new BgmEngine(() => mix.sink());
  const current = { mix, engine };
  audition = current;
  const stopIt = () => {
    engine.stop();
    engine.dispose();
    mix.close();
    if (audition === current) audition = null;
  };
  void engine
    .start(0, {
      mood: settings.mood,
      volume: Math.max(0.15, settings.volume),
      muted: false,
      accents: false,
      total: seconds,
      cutStarts: [],
    })
    .then((started) => {
      if (started) window.setTimeout(stopIt, seconds * 1000);
      else stopIt();
    })
    .catch(stopIt);
}
