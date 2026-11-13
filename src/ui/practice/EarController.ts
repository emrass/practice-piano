import type { EarExercise } from '../../core/ear/generator';
import type { ExerciseResult } from '../../core/eval/types';
import { WaitEngine } from '../../core/eval/waitEngine';
import type { NoteInput } from '../../core/input/events';
import { createStore, Emitter, type Store } from '../../lib/store';
import type { InputBus } from '../../input/inputBus';
import type { AudioEngine } from '../../platform/audio/audioEngine';
import type { PracticeState } from './PracticeController';
import type { Session } from './session';

export interface EarOptions {
  exercise: EarExercise;
  graceMs: number;
  sustainCountsAsHeld: boolean;
  /** Synth volume 0–1. */
  volume: number;
}

const EMPTY_LIVE = { correct: 0, wrong: 0, missed: 0, streak: 0, bestStreak: 0, accuracy: 1, timing: null };

/**
 * Ear training: play the phrase (after an optional key-setting cadence), then let the
 * player find it on the keyboard step by step. Notes stay hidden on the staff until they
 * are found (or revealed by a hint). Input is ignored while the phrase is playing.
 */
export class EarController implements Session {
  readonly state: Store<PracticeState>;
  readonly finished = new Emitter<ExerciseResult>();
  private readonly engine: WaitEngine;
  private stopAudio: (() => void) | null = null;
  private playTimer: ReturnType<typeof setTimeout> | null = null;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private unsub: (() => void) | null = null;

  constructor(
    private readonly opts: EarOptions,
    private readonly bus: InputBus,
    private readonly audio: AudioEngine,
  ) {
    this.engine = new WaitEngine(opts.exercise.steps, { graceMs: opts.graceMs, sustainCountsAsHeld: opts.sustainCountsAsHeld });
    const given = opts.exercise.ear.firstNoteGiven;
    this.state = createStore<PracticeState>({
      status: 'ready',
      mode: 'ear',
      stepIndex: 0,
      expected: given ? opts.exercise.steps[0].midis : [],
      countIn: null,
      beat: null,
      live: EMPTY_LIVE,
      marks: {},
      wrong: null,
      lastGrade: null,
      result: null,
      visibleSteps: given ? 1 : 0,
      ear: { playing: false, listened: false, replays: 0, hints: 0 },
    });
  }

  get exercise(): EarExercise {
    return this.opts.exercise;
  }

  get isActive(): boolean {
    return this.state.get().ear?.playing ?? false;
  }

  attach(): () => void {
    this.unsub = this.bus.subscribe((ev) => this.handleInput(ev));
    return () => this.dispose();
  }

  /** Listen (first time) or replay. Must run inside a user gesture the very first time. */
  start(): void {
    const s = this.state.get();
    if (s.status === 'finished') return;
    this.silence();
    const ex = this.opts.exercise;
    const startAt = performance.now() + 120;
    this.stopAudio = this.audio.playSequence(ex.ear.playback, startAt, this.opts.volume);
    const ear = s.ear!;
    this.state.set({
      ...s,
      status: 'running',
      ear: { ...ear, playing: true, listened: true, replays: ear.replays + (ear.listened ? 1 : 0) },
    });
    this.playTimer = setTimeout(() => {
      this.playTimer = null;
      if (!this.engine.isStarted) this.engine.start(performance.now());
      const cur = this.state.get();
      this.state.set({ ...cur, ear: { ...cur.ear!, playing: false } });
    }, ex.ear.totalMs + 150);
  }

  /** Stop playback (e.g. before calibrating or switching lessons). */
  stop(): void {
    this.silence();
    const s = this.state.get();
    if (s.ear?.playing) this.state.set({ ...s, ear: { ...s.ear, playing: false } });
  }

  /** Reveal the current step on the staff and keyboard; it no longer counts as found by ear. */
  hint(): void {
    const s = this.state.get();
    if (s.status !== 'running' || this.engine.done) return;
    this.engine.assist();
    const step = this.opts.exercise.steps[s.stepIndex];
    this.state.set({
      ...s,
      visibleSteps: Math.max(s.visibleSteps ?? 0, s.stepIndex + 1),
      expected: step.midis,
      ear: { ...s.ear!, hints: this.engine.hintCount },
      live: this.engine.liveStats(),
    });
  }

  playheadTick(): number | null {
    return null;
  }

  setMetronomeVolume(): void {
    /* Ear training has no metronome. */
  }

  private silence() {
    this.stopAudio?.();
    this.stopAudio = null;
    if (this.playTimer) clearTimeout(this.playTimer);
    this.playTimer = null;
  }

  handleInput(ev: NoteInput): void {
    const s = this.state.get();
    if (s.status === 'finished') return;
    if (ev.kind === 'noteOff') return this.engine.noteOff(ev.midi, ev.time);
    if (ev.kind === 'sustain') return this.engine.setSustain(ev.down, ev.time);
    if (ev.kind !== 'noteOn') return;
    // Not judged before the first listen or while the phrase is playing.
    if (s.status !== 'running' || s.ear?.playing) return;
    const feedback = this.engine.noteOn(ev.midi, ev.time);
    let next = this.state.get();
    for (const f of feedback) {
      if (f.type === 'wrong') {
        const wrong = { midi: f.midi, at: performance.now() };
        next = { ...next, wrong };
        if (this.flashTimer) clearTimeout(this.flashTimer);
        this.flashTimer = setTimeout(() => {
          if (this.state.get().wrong === wrong) this.state.set({ ...this.state.get(), wrong: null });
        }, 500);
      }
      if (f.type === 'advance') {
        const visible = Math.max(next.visibleSteps ?? 0, f.fromStep + 1);
        const step = this.opts.exercise.steps[f.toStep];
        next = {
          ...next,
          stepIndex: f.toStep,
          visibleSteps: visible,
          expected: step && f.toStep < visible ? step.midis : [],
          marks: { ...next.marks, [f.fromStep]: f.clean ? 'good' : 'ok' },
        };
      }
    }
    next = { ...next, live: this.engine.liveStats() };
    this.state.set(next);
    if (feedback.some((f) => f.type === 'complete')) this.finish();
  }

  private finish() {
    const ex = this.opts.exercise;
    const s = this.state.get();
    const raw = this.engine.result({ exerciseId: ex.id, level: ex.meta.level, tierId: ex.meta.tierId, completedAt: Date.now() });
    const result: ExerciseResult = { ...raw, lesson: 'ear', mode: 'ear', replays: s.ear?.replays ?? 0, hints: this.engine.hintCount };
    this.silence();
    this.state.set({ ...s, status: 'finished', result, expected: [], visibleSteps: ex.steps.length, ear: { ...s.ear!, playing: false } });
    this.finished.emit(result);
  }

  dispose(): void {
    this.silence();
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.unsub?.();
    this.unsub = null;
  }
}
