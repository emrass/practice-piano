import type { Exercise } from '../../core/exercise';
import { FlowEngine } from '../../core/eval/flowEngine';
import type { ExerciseResult, PracticeMode } from '../../core/eval/types';
import { WaitEngine } from '../../core/eval/waitEngine';
import type { NoteInput } from '../../core/input/events';
import { msPerTick } from '../../core/music/rhythm';
import { annotateRhythm } from '../../core/rhythm/analysis';
import type { InputBus } from '../../input/inputBus';
import type { AudioEngine } from '../../platform/audio/audioEngine';
import type { PracticeState } from './session';
import { EMPTY_LIVE, type FlowClock, SessionBase, StepMarks } from './sessionBase';

export interface PracticeOptions {
  exercise: Exercise;
  mode: PracticeMode;
  graceMs: number;
  sustainCountsAsHeld: boolean;
  latencyMs: number;
  playheadDelayMs: number;
  metronomeVolume: number;
  countInBars: number;
  /** Turns the engine's raw result into the lesson's result (default: sight reading). */
  decorate?: (raw: ExerciseResult) => ExerciseResult;
}

/**
 * Runs one practice session over one exercise: routes input to the Wait/Flow engine,
 * drives the metronome and publishes UI state. Rendering (score, playhead) reads from it
 * but never re-renders it at frame rate. Sight reading and scales use it.
 */
export class PracticeController extends SessionBase {
  private wait: WaitEngine | null = null;
  private flow: FlowEngine | null = null;
  private clock: FlowClock | null = null;
  private readonly marks = new StepMarks();
  private readonly tickMs: number;

  constructor(
    private readonly opts: PracticeOptions,
    bus: InputBus,
    audio: AudioEngine,
  ) {
    super(bus, audio, initialState(opts));
    this.tickMs = msPerTick(opts.exercise.bpm, opts.exercise.timeSignature);
    if (opts.mode === 'wait') this.resetWait();
  }

  get exercise(): Exercise {
    return this.opts.exercise;
  }

  get msPerTick(): number {
    return this.tickMs;
  }

  /** performance.now() time of bar 1, beat 1 in Flow mode (null when not running). */
  get flowStartTime(): number | null {
    return this.flow ? this.flow.startTime : null;
  }

  private resetWait() {
    this.wait = new WaitEngine(this.opts.exercise.steps, {
      graceMs: this.opts.graceMs,
      sustainCountsAsHeld: this.opts.sustainCountsAsHeld,
    });
    this.state.set({ ...initialState(this.opts), status: 'running' });
  }

  /** Flow: start count-in. Wait: restart from the first note. */
  start(): void {
    this.stopFrames();
    this.metronome.stop();
    if (this.opts.mode === 'wait') {
      this.resetWait();
      return;
    }
    const ex = this.opts.exercise;
    this.clock = this.startCountIn({
      timeSignature: ex.timeSignature,
      tickMs: this.tickMs,
      countInBars: this.opts.countInBars,
      totalTicks: ex.totalTicks,
      volume: this.opts.metronomeVolume,
    });
    this.flow = new FlowEngine(ex.steps, {
      msPerTick: this.tickMs,
      latencyMs: this.opts.latencyMs,
      sustainCountsAsHeld: this.opts.sustainCountsAsHeld,
      endTick: ex.totalTicks,
    });
    this.flow.setStartTime(this.clock.startTime);
    this.marks.reset();
    this.state.set({ ...initialState(this.opts), status: 'countin', countIn: { beat: 0, total: this.clock.countInBeats } });
    this.runFrames(this.frame);
  }

  /** Wait: show the current step's keys until it is played (the step no longer counts as first try). */
  hint(): void {
    const engine = this.wait;
    const s = this.state.get();
    if (!engine || s.status !== 'running' || engine.done || s.revealed.length) return;
    engine.assist();
    this.state.set({
      ...s,
      revealed: engine.currentStep?.midis ?? [],
      hint: { count: engine.hintCount, nudge: false },
      live: engine.liveStats(),
    });
  }

  stop(): void {
    this.stopFrames();
    this.metronome.stop();
    this.flow = null;
    if (this.opts.mode === 'flow') this.state.set(initialState(this.opts));
  }

  /** Visual playhead position in ticks (Flow mode), honouring the optional audio delay. */
  playheadTick(now = performance.now()): number | null {
    if (!this.flow) return null;
    const visualNow = now - this.opts.playheadDelayMs;
    return (visualNow - this.flow.startTime) / this.tickMs;
  }

  private frame = (): boolean => {
    const flow = this.flow;
    const clock = this.clock;
    if (!flow || !clock) return false;
    const now = performance.now();
    const visualNow = now - this.opts.playheadDelayMs;
    if (visualNow < flow.startTime) {
      this.showCountIn(clock, visualNow);
      return true;
    }
    const ts = this.opts.exercise.timeSignature;
    const s = this.state.get();
    const misses = flow.update(now);
    const tick = (visualNow - flow.startTime) / this.tickMs;
    const beatIndex = Math.floor(tick / ts.beatTicks) % ts.beatsPerBar;
    const steps = this.opts.exercise.steps;
    // Guide/cursor: the next step that is due (or just due).
    let idx = steps.findIndex((st) => st.tick * this.tickMs >= tick * this.tickMs - flow.timing.perfectMs);
    if (idx < 0) idx = steps.length;
    const next: Partial<PracticeState> = {};
    if (s.status !== 'running') Object.assign(next, { status: 'running', countIn: null });
    if (s.beat?.index !== beatIndex) next.beat = { index: beatIndex, beatsPerBar: ts.beatsPerBar };
    if (idx !== s.stepIndex) Object.assign(next, { stepIndex: idx, expected: steps[idx]?.midis ?? [] });
    if (misses.length) {
      const marks = { ...s.marks };
      for (const m of misses) if (m.type === 'miss') marks[m.stepIndex] = this.marks.miss(m.stepIndex);
      Object.assign(next, { marks, live: flow.liveStats() });
    }
    if (Object.keys(next).length) this.patch(next);
    if (flow.isFinished(now)) {
      this.finish(flow.result(this.resultContext()));
      return false;
    }
    return true;
  };

  private resultContext() {
    const ex = this.opts.exercise;
    return { exerciseId: ex.id, level: ex.meta.level, tierId: ex.meta.tierId, completedAt: Date.now() };
  }

  private finish(raw: ExerciseResult) {
    const result: ExerciseResult = this.opts.decorate
      ? this.opts.decorate(raw)
      : { ...raw, lesson: 'sight', notes: annotateRhythm(this.opts.exercise, raw.notes) };
    this.stopFrames();
    this.metronome.stop();
    this.patch({ status: 'finished', result, expected: [], revealed: [], beat: null, countIn: null });
    this.finished.emit(result);
  }

  handleInput(ev: NoteInput): void {
    const s = this.state.get();
    if (s.status === 'finished') return;
    if (this.opts.mode === 'wait') this.handleWait(ev);
    else this.handleFlow(ev);
  }

  private handleWait(ev: NoteInput) {
    const engine = this.wait;
    if (!engine) return;
    if (ev.kind === 'noteOff') return engine.noteOff(ev.midi, ev.time);
    if (ev.kind === 'sustain') return engine.setSustain(ev.down, ev.time);
    if (ev.kind !== 'noteOn') return;
    const feedback = engine.noteOn(ev.midi, ev.time);
    if (!feedback.length) return;
    let s = this.state.get();
    for (const f of feedback) {
      if (f.type === 'wrong') s = { ...s, ...this.flash('wrong', { midi: f.midi, at: performance.now() }, 500) };
      if (f.type === 'advance') {
        const step = this.opts.exercise.steps[f.toStep];
        s = { ...s, stepIndex: f.toStep, expected: step ? step.midis : [], revealed: [], marks: { ...s.marks, [f.fromStep]: f.clean ? 'good' : 'ok' } };
      }
    }
    s = { ...s, live: engine.liveStats() };
    this.state.set(s);
    if (feedback.some((f) => f.type === 'complete')) this.finish(engine.result(this.resultContext()));
  }

  private handleFlow(ev: NoteInput) {
    const flow = this.flow;
    if (!flow) return;
    if (ev.kind === 'sustain') {
      flow.setSustain(ev.down, ev.time);
      return;
    }
    if (ev.kind === 'noteOff') {
      flow.noteOff(ev.midi, ev.time);
      return;
    }
    if (ev.kind !== 'noteOn') return;
    // Ignore warm-up noodling during the count-in.
    if (ev.time - this.opts.latencyMs < flow.startTime - flow.timing.hitMs) return;
    const feedback = flow.noteOn(ev.midi, ev.time, ev.velocity);
    let s = this.state.get();
    for (const f of feedback) {
      if (f.type === 'extra') s = { ...s, ...this.flash('wrong', { midi: f.midi, at: performance.now() }, 500) };
      if (f.type === 'hit') {
        const step = this.opts.exercise.steps[f.stepIndex];
        const mark = this.marks.hit(f.stepIndex, step?.notes.length ?? 1, f.grade === 'early' || f.grade === 'late');
        s = {
          ...s,
          marks: mark ? { ...s.marks, [f.stepIndex]: mark } : s.marks,
          ...this.flash('lastGrade', { grade: f.grade, deltaMs: f.deltaMs, at: performance.now() }, 900),
        };
      }
    }
    this.state.set({ ...s, live: flow.liveStats() });
  }
}

function initialState(opts: PracticeOptions): PracticeState {
  const first = opts.exercise.steps[0];
  return {
    status: 'ready',
    mode: opts.mode,
    stepIndex: 0,
    expected: first ? first.midis : [],
    revealed: [],
    hint: opts.mode === 'wait' ? { count: 0, nudge: false } : undefined,
    countIn: null,
    beat: null,
    live: EMPTY_LIVE,
    marks: {},
    wrong: null,
    lastGrade: null,
    result: null,
  };
}
