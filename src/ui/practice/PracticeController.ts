import type { Exercise } from '../../core/exercise';
import { FlowEngine, type TimingGrade } from '../../core/eval/flowEngine';
import type { ExerciseResult, LiveStats, PracticeMode } from '../../core/eval/types';
import { WaitEngine } from '../../core/eval/waitEngine';
import type { NoteInput } from '../../core/input/events';
import { msPerTick } from '../../core/music/rhythm';
import { createStore, Emitter, type Store } from '../../lib/store';
import type { InputBus } from '../../input/inputBus';
import { type AudioEngine, Metronome } from '../../platform/audio/audioEngine';
import type { Session } from './session';
import { annotateRhythm } from '../../core/rhythm/analysis';

export type StepMark = 'good' | 'ok' | 'bad' | 'missed' | 'call';
export type PracticeStatus = 'ready' | 'countin' | 'running' | 'finished';

export interface PracticeState {
  status: PracticeStatus;
  mode: PracticeMode;
  stepIndex: number;
  /** Keys the guide should highlight. */
  expected: number[];
  countIn: { beat: number; total: number } | null;
  beat: { index: number; beatsPerBar: number } | null;
  live: LiveStats;
  marks: Record<number, StepMark>;
  wrong: { midi: number; at: number } | null;
  lastGrade: { grade: TimingGrade; deltaMs: number; at: number } | null;
  result: ExerciseResult | null;
  /** Ear training: steps with index < visibleSteps are shown; undefined = all shown. */
  visibleSteps?: number;
  /** Rhythm Echo: bars with index < visibleBars are shown; undefined = all shown. */
  visibleBars?: number;
  /** Rhythm mode: what the current bar is (Echo call / response, Pulse click / silent). */
  rhythm?: { phase: 'call' | 'response' | 'click' | 'silent' | null };
  ear?: { playing: boolean; listened: boolean; replays: number; hints: number };
}

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

const EMPTY_LIVE: LiveStats = { correct: 0, wrong: 0, missed: 0, streak: 0, bestStreak: 0, accuracy: 1, timing: null };

/**
 * Runs one practice session over one exercise: routes input to the Wait/Flow engine,
 * drives the metronome and publishes UI state. Rendering (score, playhead) reads from it
 * but never re-renders it at frame rate.
 */
export class PracticeController implements Session {
  readonly state: Store<PracticeState>;
  /** Fires once per completed run. */
  readonly finished = new Emitter<ExerciseResult>();
  private flashTimers: ReturnType<typeof setTimeout>[] = [];
  private wait: WaitEngine | null = null;
  private flow: FlowEngine | null = null;
  private readonly metronome: Metronome;
  private raf = 0;
  private unsub: (() => void) | null = null;
  private countInStart = 0;
  private beatMs = 0;
  private countInBeats = 0;
  private stepHits = new Map<number, { hit: number; missed: number; imperfect: boolean }>();
  private readonly tickMs: number;

  constructor(
    private readonly opts: PracticeOptions,
    private readonly bus: InputBus,
    private readonly audio: AudioEngine,
  ) {
    this.metronome = new Metronome(audio);
    this.tickMs = msPerTick(opts.exercise.bpm, opts.exercise.timeSignature);
    this.state = createStore<PracticeState>(this.initialState());
    if (opts.mode === 'wait') this.resetWait();
  }

  private initialState(): PracticeState {
    const first = this.opts.exercise.steps[0];
    return {
      status: 'ready',
      mode: this.opts.mode,
      stepIndex: 0,
      expected: first ? first.midis : [],
      countIn: null,
      beat: null,
      live: EMPTY_LIVE,
      marks: {},
      wrong: null,
      lastGrade: null,
      result: null,
    };
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

  attach(): () => void {
    this.unsub = this.bus.subscribe((ev) => this.handleInput(ev));
    return () => this.dispose();
  }

  private resetWait() {
    this.wait = new WaitEngine(this.opts.exercise.steps, {
      graceMs: this.opts.graceMs,
      sustainCountsAsHeld: this.opts.sustainCountsAsHeld,
    });
    this.state.set({ ...this.initialState(), status: 'running' });
  }

  /** Flow: start count-in. Wait: restart from the first note. */
  start(): void {
    this.stopLoop();
    this.metronome.stop();
    if (this.opts.mode === 'wait') {
      this.resetWait();
      return;
    }
    const ex = this.opts.exercise;
    const ts = ex.timeSignature;
    this.audio.ensure();
    this.beatMs = this.tickMs * ts.beatTicks;
    const bars = Math.max(this.opts.countInBars, Math.ceil(3 / ts.beatsPerBar));
    this.countInBeats = bars * ts.beatsPerBar;
    this.countInStart = performance.now() + 250;
    const t0 = this.countInStart + this.countInBeats * this.beatMs;
    this.flow = new FlowEngine(ex.steps, {
      msPerTick: this.tickMs,
      latencyMs: this.opts.latencyMs,
      sustainCountsAsHeld: this.opts.sustainCountsAsHeld,
    });
    this.flow.setStartTime(t0);
    this.stepHits = new Map();
    const exerciseBeats = Math.ceil(ex.totalTicks / ts.beatTicks);
    this.metronome.start({
      startTime: this.countInStart,
      beatMs: this.beatMs,
      beatsPerBar: ts.beatsPerBar,
      totalBeats: this.countInBeats + exerciseBeats,
      volume: this.opts.metronomeVolume,
    });
    this.state.set({ ...this.initialState(), status: 'countin', countIn: { beat: 0, total: this.countInBeats } });
    this.loop();
  }

  stop(): void {
    this.stopLoop();
    this.metronome.stop();
    this.flow = null;
    if (this.opts.mode === 'flow') this.state.set(this.initialState());
  }

  get isActive(): boolean {
    const s = this.state.get().status;
    return s === 'countin' || s === 'running';
  }

  setMetronomeVolume(v: number) {
    this.metronome.setVolume(v);
  }

  /** Visual playhead position in ticks (Flow mode), honouring the optional audio delay. */
  playheadTick(now = performance.now()): number | null {
    if (!this.flow) return null;
    const visualNow = now - this.opts.playheadDelayMs;
    return (visualNow - this.flow.startTime) / this.tickMs;
  }

  private stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private loop = () => {
    const flow = this.flow;
    if (!flow) return;
    const now = performance.now();
    const visualNow = now - this.opts.playheadDelayMs;
    const ts = this.opts.exercise.timeSignature;
    const s = this.state.get();
    if (visualNow < flow.startTime) {
      const beat = visualNow < this.countInStart ? 0 : Math.floor((visualNow - this.countInStart) / this.beatMs) + 1;
      if (s.countIn?.beat !== beat) this.state.set({ ...s, status: 'countin', countIn: { beat, total: this.countInBeats } });
    } else {
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
        for (const m of misses) {
          if (m.type !== 'miss') continue;
          const h = this.bumpStep(m.stepIndex, 'missed');
          marks[m.stepIndex] = h.hit === 0 ? 'missed' : 'bad';
        }
        Object.assign(next, { marks, live: flow.liveStats() });
      }
      if (Object.keys(next).length) this.state.set({ ...this.state.get(), ...next });
      if (flow.isFinished(now)) {
        this.finish(flow.result(this.resultContext()));
        return;
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  private bumpStep(stepIndex: number, kind: 'hit' | 'missed', imperfect = false) {
    const h = this.stepHits.get(stepIndex) ?? { hit: 0, missed: 0, imperfect: false };
    if (kind === 'hit') h.hit++;
    else h.missed++;
    h.imperfect ||= imperfect;
    this.stepHits.set(stepIndex, h);
    return h;
  }

  private resultContext() {
    const ex = this.opts.exercise;
    return { exerciseId: ex.id, level: ex.meta.level, tierId: ex.meta.tierId, completedAt: Date.now() };
  }

  private finish(raw: ExerciseResult) {
    const result: ExerciseResult = this.opts.decorate
      ? this.opts.decorate(raw)
      : { ...raw, lesson: 'sight', notes: annotateRhythm(this.opts.exercise, raw.notes) };
    this.stopLoop();
    this.metronome.stop();
    this.state.set({ ...this.state.get(), status: 'finished', result, expected: [], beat: null, countIn: null });
    this.finished.emit(result);
  }

  /** Transient feedback (wrong key, timing grade) clears itself after a moment. */
  private flash<K extends 'wrong' | 'lastGrade'>(key: K, value: NonNullable<PracticeState[K]>, ms: number): Partial<PracticeState> {
    const timer = setTimeout(() => {
      if (this.state.get()[key] === value) this.state.set({ ...this.state.get(), [key]: null });
    }, ms);
    this.flashTimers.push(timer);
    if (this.flashTimers.length > 20) this.flashTimers.shift();
    return { [key]: value } as Partial<PracticeState>;
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
        s = { ...s, stepIndex: f.toStep, expected: step ? step.midis : [], marks: { ...s.marks, [f.fromStep]: f.clean ? 'good' : 'ok' } };
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
        const h = this.bumpStep(f.stepIndex, 'hit', f.grade === 'early' || f.grade === 'late');
        const complete = h.hit >= (step?.notes.length ?? 1);
        const mark: StepMark = h.missed > 0 ? 'bad' : complete ? (h.imperfect ? 'ok' : 'good') : (s.marks[f.stepIndex] ?? 'ok');
        s = {
          ...s,
          marks: complete || h.missed > 0 ? { ...s.marks, [f.stepIndex]: mark } : s.marks,
          ...this.flash('lastGrade', { grade: f.grade, deltaMs: f.deltaMs, at: performance.now() }, 900),
        };
      }
    }
    this.state.set({ ...s, live: flow.liveStats() });
  }

  dispose(): void {
    this.flashTimers.splice(0).forEach(clearTimeout);
    this.stopLoop();
    this.metronome.stop();
    this.unsub?.();
    this.unsub = null;
  }
}
