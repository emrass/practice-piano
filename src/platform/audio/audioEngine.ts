/**
 * Web Audio output. v1 only produces metronome clicks (the player hears their own piano),
 * but the engine is the single place audio goes through, so a sampled / synthesised piano
 * can be added later by implementing NoteSynth and registering it here.
 */
export interface NoteSynth {
  noteOn(midi: number, velocity: number, when?: number): void;
  noteOff(midi: number, when?: number): void;
}

type AudioContextCtor = typeof AudioContext;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Reserved for a future piano sound. */
  synth: NoteSynth | null = null;

  get available(): boolean {
    return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
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
        if (at >= performance.now() - 20) this.engine.click(at, this.nextBeat % p.beatsPerBar === 0, p.volume);
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
