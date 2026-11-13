import type { Exercise } from '../../core/exercise';
import type { ExerciseResult, LiveStats } from '../../core/eval/types';
import type { NoteInput } from '../../core/input/events';
import type { TimeSignature } from '../../core/music/rhythm';
import { createStore, Emitter, type Store } from '../../lib/store';
import type { InputBus } from '../../input/inputBus';
import { type AudioEngine, Metronome } from '../../platform/audio/audioEngine';
import type { PracticeState, Session, StepMark } from './session';

export const EMPTY_LIVE: LiveStats = { correct: 0, wrong: 0, missed: 0, streak: 0, bestStreak: 0, accuracy: 1, timing: null };

/** Flow timing of one run: count-in start, its length and where bar 1 beat 1 falls. */
export interface FlowClock {
  countInStart: number;
  countInBeats: number;
  beatMs: number;
  /** performance.now() time of bar 1, beat 1. */
  startTime: number;
}

/**
 * Plumbing every practice session shares: the state store and finished event, the input
 * subscription, self-clearing feedback flashes, the animation-frame loop, the metronome and
 * the count-in. Lessons add their engines, input handling and results on top.
 */
export abstract class SessionBase implements Session {
  readonly state: Store<PracticeState>;
  readonly finished = new Emitter<ExerciseResult>();
  protected readonly metronome: Metronome;
  private raf = 0;
  private unsub: (() => void) | null = null;
  private flashTimers: ReturnType<typeof setTimeout>[] = [];

  protected constructor(
    protected readonly bus: InputBus,
    protected readonly audio: AudioEngine,
    initial: PracticeState,
  ) {
    this.metronome = new Metronome(audio);
    this.state = createStore<PracticeState>(initial);
  }

  abstract get exercise(): Exercise;
  abstract start(): void;
  abstract stop(): void;
  abstract handleInput(ev: NoteInput): void;

  get isActive(): boolean {
    const s = this.state.get().status;
    return s === 'countin' || s === 'running';
  }

  playheadTick(_now?: number): number | null {
    return null;
  }

  attach(): () => void {
    this.unsub = this.bus.subscribe((ev) => this.handleInput(ev));
    return () => this.dispose();
  }

  setMetronomeVolume(volume: number): void {
    this.metronome.setVolume(volume);
  }

  /** Merge a patch into the current state. */
  protected patch(p: Partial<PracticeState>): void {
    this.state.set({ ...this.state.get(), ...p });
  }

  /** Transient feedback (wrong key, timing grade) that clears itself after `ms`. */
  protected flash<K extends 'wrong' | 'lastGrade'>(key: K, value: NonNullable<PracticeState[K]>, ms: number): Partial<PracticeState> {
    const timer = setTimeout(() => {
      if (this.state.get()[key] === value) this.patch({ [key]: null } as Partial<PracticeState>);
    }, ms);
    this.flashTimers.push(timer);
    if (this.flashTimers.length > 20) this.flashTimers.shift();
    return { [key]: value } as Partial<PracticeState>;
  }

  /** Run `frame` now and on every animation frame while it returns true. */
  protected runFrames(frame: () => boolean): void {
    this.stopFrames();
    const tick = () => {
      this.raf = 0;
      if (frame()) this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  protected stopFrames(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /**
   * Start the metronome with a count-in (at least three beats) before bar 1, and the clicks
   * through the whole exercise. `muted(beat)` silences single beats (counted from the
   * count-in's first beat).
   */
  protected startCountIn(opts: {
    timeSignature: TimeSignature;
    tickMs: number;
    countInBars: number;
    totalTicks: number;
    volume: number;
    muted?: (beat: number, countInBeats: number) => boolean;
  }): FlowClock {
    const ts = opts.timeSignature;
    this.audio.ensure();
    const beatMs = opts.tickMs * ts.beatTicks;
    const bars = Math.max(opts.countInBars, Math.ceil(3 / ts.beatsPerBar));
    const countInBeats = bars * ts.beatsPerBar;
    const countInStart = performance.now() + 250;
    const muted = opts.muted;
    this.metronome.start({
      startTime: countInStart,
      beatMs,
      beatsPerBar: ts.beatsPerBar,
      totalBeats: countInBeats + Math.ceil(opts.totalTicks / ts.beatTicks),
      volume: opts.volume,
      muted: muted ? (beat) => muted(beat, countInBeats) : undefined,
    });
    return { countInStart, countInBeats, beatMs, startTime: countInStart + countInBeats * beatMs };
  }

  /** During the count-in: update the beat shown (0 before the first click). */
  protected showCountIn(clock: FlowClock, visualNow: number): void {
    const beat = visualNow < clock.countInStart ? 0 : Math.floor((visualNow - clock.countInStart) / clock.beatMs) + 1;
    const s = this.state.get();
    if (s.countIn?.beat !== beat) this.state.set({ ...s, status: 'countin', countIn: { beat, total: clock.countInBeats } });
  }

  dispose(): void {
    this.flashTimers.splice(0).forEach(clearTimeout);
    this.stopFrames();
    this.metronome.stop();
    this.unsub?.();
    this.unsub = null;
  }
}

/**
 * Flow mode marks per step: a step is good when all its notes were hit on time, ok when some
 * were early or late, bad when some were missed, missed when none were hit.
 */
export class StepMarks {
  private hits = new Map<number, { hit: number; missed: number; imperfect: boolean }>();

  reset(): void {
    this.hits = new Map();
  }

  /** A note of the step was hit; returns the step's mark, or null while it is still incomplete. */
  hit(stepIndex: number, notesInStep: number, imperfect: boolean): StepMark | null {
    const h = this.entry(stepIndex);
    h.hit++;
    h.imperfect ||= imperfect;
    if (h.missed > 0) return 'bad';
    return h.hit >= notesInStep ? (h.imperfect ? 'ok' : 'good') : null;
  }

  /** A note of the step was missed. */
  miss(stepIndex: number): StepMark {
    const h = this.entry(stepIndex);
    h.missed++;
    return h.hit === 0 ? 'missed' : 'bad';
  }

  private entry(stepIndex: number) {
    let h = this.hits.get(stepIndex);
    if (!h) this.hits.set(stepIndex, (h = { hit: 0, missed: 0, imperfect: false }));
    return h;
  }
}
