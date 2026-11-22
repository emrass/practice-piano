import { isNativeApp, type NativeAudioEvent, nativePlatform, onNativeMessage, postNative } from '../native';

/**
 * Web Audio output: metronome clicks and a small synthesized piano voice used by ear
 * training, Rhythm Echo calls and (optionally) the on-screen and computer keys. MIDI input
 * never sounds: the player hears their own piano. A sampled piano can replace the voice
 * later by implementing NoteSynth.
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

/** A resume that has not brought the context back to running by then is stuck. */
const RESUME_GRACE_MS = 1500;
/** Sounds still go into a context that is not running yet only this soon after asking it to resume. */
const FRESH_RESUME_MS = 300;
/** Rebuilds at most this often, so an interruption that lasts (a phone call) cannot cause a loop. */
const REBUILD_GAP_MS = 5000;

export interface AudioEngineOptions {
  /** Builds a context; defaults to the browser's (webkit-prefixed if need be). */
  createContext?: () => AudioContext;
  /** Clock in ms, performance.now() by default. */
  now?: () => number;
  /** Where recovery events are reported; the console by default. */
  log?: (message: string) => void;
  /** Called before each new context is built (e.g. to ask the platform for a playback session). */
  beforeCreate?: () => void;
}

/**
 * WebKit stops a running context on audio interruptions, route changes (a Bluetooth device
 * connecting) and in the background, as "suspended" or "interrupted", and does not always restart
 * it. The engine therefore resumes whenever the context leaves "running", again before each
 * sound, and builds a new context when a resume does not take.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly live = new Map<number, GainNode>();
  /** When a resume was asked for that has not brought the context back to running yet. */
  private resumeAskedAt: number | null = null;
  private lastRebuild = Number.NEGATIVE_INFINITY;
  /** The context has run at least once, so audio was unlocked by a gesture where that is needed. */
  private hasRun = false;
  synth: NoteSynth = simplePiano;

  constructor(private readonly opts: AudioEngineOptions = {}) {}

  get available(): boolean {
    if (this.opts.createContext) return true;
    return typeof window !== 'undefined' && ('AudioContext' in window || 'webkitAudioContext' in window);
  }

  /**
   * True once audio has been unlocked (it ran at least once) and the context is still usable,
   * even while it is being brought back from an interruption.
   */
  get isRunning(): boolean {
    const state = this.ctx?.state;
    return state === 'running' || (this.hasRun && state !== undefined && state !== 'closed');
  }

  /** Must be called from a user gesture the first time (autoplay policies). */
  ensure(): AudioContext | null {
    if (!this.available) return null;
    if (!this.ctx) this.build('first use');
    else this.revive();
    return this.ctx;
  }

  /**
   * Brings an existing context back to running: resumes it, or builds a new one when it is closed
   * or a resume has not taken. Never creates the first context (that needs a gesture).
   */
  revive(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === 'running') return;
    if (ctx.state === 'closed') {
      this.build('context was closed');
      return;
    }
    const now = this.now();
    // A context that never ran is waiting for a tap (browser autoplay rules); a new one would too.
    if (this.hasRun && this.resumeAskedAt !== null && now - this.resumeAskedAt > RESUME_GRACE_MS && now - this.lastRebuild > REBUILD_GAP_MS) {
      this.build(`still ${ctx.state} ${Math.round(now - this.resumeAskedAt)} ms after asking to resume`);
      return;
    }
    this.resume(ctx);
  }

  /** The native app reports what happened to the iOS audio session. */
  handleNativeEvent(event: NativeAudioEvent): void {
    this.log(`native: ${event}${this.ctx ? `, context ${this.ctx.state}` : ''}`);
    if (!this.ctx || event === 'interruptionBegan') return;
    if (event === 'mediaServicesReset') this.build('media services were reset');
    else this.revive();
  }

  /** The page became visible again. */
  handleVisible(): void {
    if (this.ctx && this.ctx.state !== 'running') {
      this.log(`page visible, context ${this.ctx.state}`);
      this.revive();
    }
  }

  private now(): number {
    return this.opts.now ? this.opts.now() : performance.now();
  }

  private log(message: string): void {
    if (this.opts.log) this.opts.log(message);
    else console.info(`[audio] ${message}`);
  }

  private build(reason: string): void {
    const old = this.ctx;
    if (old) {
      old.onstatechange = null;
      if (old.state !== 'closed') old.close().catch(() => {});
      // Notes held on the old context are gone with it.
      this.live.clear();
    }
    this.opts.beforeCreate?.();
    let ctx: AudioContext;
    if (this.opts.createContext) ctx = this.opts.createContext();
    else {
      const Ctor: AudioContextCtor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: AudioContextCtor }).webkitAudioContext;
      ctx = new Ctor({ latencyHint: 'interactive' });
    }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    if (old) this.lastRebuild = this.now();
    this.resumeAskedAt = null;
    this.log(`${old ? 'new' : 'created'} context (${reason}), ${ctx.state}`);
    ctx.onstatechange = () => {
      if (this.ctx !== ctx) return;
      this.log(`context ${ctx.state}`);
      if (ctx.state === 'running') {
        this.resumeAskedAt = null;
        this.hasRun = true;
      } else if (ctx.state !== 'closed') {
        // Stopped by the system (interruption, route change): ask for it back right away.
        this.resume(ctx);
      }
    };
    if (ctx.state === 'running') this.hasRun = true;
    else this.resume(ctx);
  }

  private resume(ctx: AudioContext): void {
    if (ctx.state === 'running' || ctx.state === 'closed') return;
    if (this.resumeAskedAt === null) {
      this.resumeAskedAt = this.now();
      this.log(`resuming from ${ctx.state}`);
    }
    ctx.resume().catch((err: unknown) => this.log(`resume failed: ${String(err)}`));
  }

  /**
   * Revives the context and says whether a sound can go into it now. A context that has not
   * been running for a while would queue every sound and play them all at once when it resumes.
   */
  private ready(): AudioContext | null {
    this.revive();
    const ctx = this.ctx;
    if (!ctx || !this.master) return null;
    if (ctx.state === 'running') return ctx;
    if (ctx.state !== 'closed' && this.resumeAskedAt !== null && this.now() - this.resumeAskedAt <= FRESH_RESUME_MS) return ctx;
    return null;
  }

  /** Convert a performance.now() timestamp to AudioContext time. */
  toContextTime(perfMs: number): number {
    const ctx = this.ctx!;
    return ctx.currentTime + (perfMs - performance.now()) / 1000;
  }

  /** Play notes (a chord if several) at a performance.now() time. */
  playNotes(midis: readonly number[], perfMs: number, durationMs: number, volume = 0.8, out?: AudioNode): void {
    if (volume <= 0) return;
    const ctx = this.ready();
    // A passage's bus belongs to the context it started on; a newer context cannot play into it.
    if (!ctx || !this.master || (out && out.context !== ctx)) return;
    const t = Math.max(ctx.currentTime, this.toContextTime(perfMs));
    const v = volume / Math.sqrt(Math.max(1, midis.length));
    for (const m of midis) this.synth.play(ctx, out ?? this.master, m, t, durationMs / 1000, v);
  }

  /**
   * Schedule a whole passage. Returns a function that silences it immediately (used when
   * the player asks for a replay or leaves the exercise mid-playback).
   */
  playSequence(events: readonly { at: number; dur: number; midis: readonly number[] }[], startPerfMs: number, volume = 0.8): () => void {
    this.ensure();
    const ctx = this.ready();
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

  /** Live note for as long as a key is held (on-screen keys); released by stopNote. */
  startNote(midi: number, velocity: number, volume = 0.8): void {
    const ctx = this.ensure();
    if (!ctx || !this.master || volume <= 0) return;
    this.stopNote(midi);
    const bus = ctx.createGain();
    bus.connect(this.master);
    // A long natural decay; the key release cuts it short.
    this.synth.play(ctx, bus, midi, ctx.currentTime, 4, Math.max(0.2, Math.min(1, velocity)) * volume);
    this.live.set(midi, bus);
  }

  stopNote(midi: number): void {
    const bus = this.live.get(midi);
    const ctx = this.ctx;
    if (!bus || !ctx) return;
    this.live.delete(midi);
    const now = ctx.currentTime;
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    setTimeout(() => bus.disconnect(), 400);
  }

  stopAllNotes(): void {
    for (const midi of [...this.live.keys()]) this.stopNote(midi);
  }

  /** Short woodblock-like click. */
  click(perfMs: number, accent: boolean, volume: number): void {
    if (volume <= 0) return;
    const ctx = this.ready();
    if (!ctx || !this.master) return;
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

/** Asks WebKit for a playback audio session, so the app sounds with silent mode on (iOS). */
function preferPlaybackSession(): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session && session.type === 'auto') session.type = 'playback';
}

function report(message: string): void {
  console.info(`[audio] ${message}`);
  // In the iPad / Mac app the native log shows it next to the audio session's own events.
  if (nativePlatform() === 'apple') postNative({ cmd: 'log', message: `audio (web): ${message}` });
}

export const audioEngine = new AudioEngine({ log: report, beforeCreate: preferPlaybackSession });

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') audioEngine.handleVisible();
  });
  if (isNativeApp()) {
    onNativeMessage((msg) => {
      if (msg.type === 'audio') audioEngine.handleNativeEvent(msg.event);
    });
  }
}
