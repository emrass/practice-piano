/**
 * Web Audio output: metronome clicks and a small synthesised piano voice used by ear
 * training. Sight reading never plays notes (the player hears their own piano). A sampled
 * piano can replace the voice later by implementing NoteSynth.
 */
export interface NoteSynth {
  /** Schedule one note; `when` and `duration` in AudioContext seconds. */
  play(ctx: AudioContext, out: AudioNode, midi: number, when: number, duration: number, velocity: number): void;
}

/** Bright-but-soft additive voice with a hammer-like attack and a decaying low-pass. */
export const simplePiano: NoteSynth = {
  play(ctx, out, midi, when, duration, velocity) {
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(12000, freq * 9), when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 2.2), when + 1.2);
    filter.Q.value = 0.4;
    // Lower notes ring longer, like strings do.
    const decay = 0.9 + Math.max(0, (72 - midi) / 30);
    const peak = 0.22 * velocity;
    const end = when + duration;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.006);
    gain.gain.exponentialRampToValueAtTime(peak * 0.35, when + 0.25);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.35 * Math.exp(-duration / decay)), end);
    gain.gain.exponentialRampToValueAtTime(0.0001, end + 0.18);
    const partials: [number, number, OscillatorType][] = [
      [1, 1, 'triangle'],
      [2, 0.35, 'sine'],
      [3, 0.12, 'sine'],
      [1.003, 0.4, 'sine'], // slight detune for warmth
    ];
    for (const [mult, level, type] of partials) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq * mult;
      g.gain.value = level;
      osc.connect(g).connect(filter);
      osc.start(when);
      osc.stop(end + 0.25);
    }
    filter.connect(gain).connect(out);
  },
};

type AudioContextCtor = typeof AudioContext;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  synth: NoteSynth = simplePiano;

  get available(): boolean {
    return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  }

  /** True once audio has been unlocked by a user gesture and is running. */
  get isRunning(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Must be called from a user gesture the first time (autoplay policies). */
  ensure(): AudioContext | null {
    if (!this.available) return null;
    if (!this.ctx) {
      const Ctor: AudioContextCtor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: AudioContextCtor }).webkitAudioContext;
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Convert a performance.now() timestamp to AudioContext time. */
  toContextTime(perfMs: number): number {
    const ctx = this.ctx!;
    return ctx.currentTime + (perfMs - performance.now()) / 1000;
  }

  /** Play notes (a chord if several) at a performance.now() time. */
  playNotes(midis: readonly number[], perfMs: number, durationMs: number, volume = 0.8, out?: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || volume <= 0) return;
    const t = Math.max(ctx.currentTime, this.toContextTime(perfMs));
    const v = volume / Math.sqrt(Math.max(1, midis.length));
    for (const m of midis) this.synth.play(ctx, out ?? this.master, m, t, durationMs / 1000, v);
  }

  /**
   * Schedule a whole passage. Returns a function that silences it immediately (used when
   * the player asks for a replay or leaves the exercise mid-playback).
   */
  playSequence(events: readonly { at: number; dur: number; midis: readonly number[] }[], startPerfMs: number, volume = 0.8): () => void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return () => {};
    const bus = ctx.createGain();
    bus.connect(this.master);
    for (const e of events) this.playNotes(e.midis, startPerfMs + e.at, e.dur, volume, bus);
    return () => {
      const now = ctx.currentTime;
      bus.gain.setValueAtTime(bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(0, now + 0.04);
      setTimeout(() => bus.disconnect(), 80);
    };
  }

  /** Short woodblock-like click. */
  click(perfMs: number, accent: boolean, volume: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || volume <= 0) return;
    const t = Math.max(ctx.currentTime, this.toContextTime(perfMs));
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(accent ? 1760 : 1175, t);
    osc.frequency.exponentialRampToValueAtTime(accent ? 880 : 660, t + 0.05);
    const peak = (accent ? 0.9 : 0.6) * volume;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.08);
  }
}

export interface MetronomePlan {
  /** performance.now() time of the first click. */
  startTime: number;
  beatMs: number;
  beatsPerBar: number;
  totalBeats: number;
  volume: number;
  /** Beats (counted from the first click) that stay silent — Rhythm mode's Pulse task. */
  muted?: (beat: number) => boolean;
}

/** Look-ahead scheduler: precise audio timing from an imprecise JS timer. */
export class Metronome {
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private plan: MetronomePlan | null = null;

  constructor(private readonly engine: AudioEngine) {}

  start(plan: MetronomePlan): void {
    this.stop();
    this.plan = plan;
    this.nextBeat = 0;
    this.engine.ensure();
    const schedule = () => {
      const p = this.plan;
      if (!p) return;
      const horizon = performance.now() + 120;
      while (this.nextBeat < p.totalBeats) {
        const at = p.startTime + this.nextBeat * p.beatMs;
        if (at > horizon) break;
        if (at >= performance.now() - 20 && !p.muted?.(this.nextBeat)) this.engine.click(at, this.nextBeat % p.beatsPerBar === 0, p.volume);
        this.nextBeat++;
      }
      if (this.nextBeat >= p.totalBeats) this.stop();
    };
    schedule();
    this.timer = setInterval(schedule, 25);
  }

  setVolume(volume: number): void {
    if (this.plan) this.plan = { ...this.plan, volume };
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.plan = null;
  }
}

export const audioEngine = new AudioEngine();
