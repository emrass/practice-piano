import { allEvents, type Exercise } from '../../core/exercise';
import { FlowEngine } from '../../core/eval/flowEngine';
import type { ExerciseResult } from '../../core/eval/types';
import type { NoteInput } from '../../core/input/events';
import { msPerTick } from '../../core/music/rhythm';
import { rhythmResult } from '../../core/rhythm/analysis';
import type { RhythmExercise } from '../../core/rhythm/generator';
import type { InputBus } from '../../input/inputBus';
import type { AudioEngine } from '../../platform/audio/audioEngine';
import type { PracticeState, StepMark } from './session';
import { EMPTY_LIVE, type FlowClock, SessionBase, StepMarks } from './sessionBase';

export interface RhythmControllerOptions {
  exercise: RhythmExercise;
  latencyMs: number;
  playheadDelayMs: number;
  metronomeVolume: number;
  countInBars: number;
  /** Volume of the call playback in Echo. */
  synthVolume: number;
}

/** Placeholder until the constructor has the exercise's bars and keys. */
const PLACEHOLDER_STATE: PracticeState = {
  status: 'ready',
  mode: 'flow',
  stepIndex: 0,
  expected: [],
  revealed: [],
  countIn: null,
  beat: null,
  live: EMPTY_LIVE,
  marks: {},
  wrong: null,
  lastGrade: null,
  result: null,
};

export type RhythmPhase = 'call' | 'response' | 'click' | 'silent';

/**
 * Rhythm mode session (docs/DIDACTICS.md §4.3). Like Flow mode — count-in, metronome, timing
 * windows with latency compensation — plus the rhythm tasks: Echo plays call bars and reveals
 * the notation after each answer, Pulse silences the metronome (and the playhead) for whole bars.
 * Only the designated keys count; other keys only flash, so a stray note is never punished.
 */
export class RhythmController extends SessionBase {
  private flow: FlowEngine | null = null;
  private clock: FlowClock | null = null;
  private readonly tickMs: number;
  private readonly callBars: Set<number>;
  private readonly mutedBars: Set<number>;
  private readonly keys: Map<number, 'rh' | 'lh'>;
  private readonly lastResponseBars: number[];
  private stopPlayback: (() => void) | null = null;
  private readonly marks = new StepMarks();

  constructor(
    private readonly opts: RhythmControllerOptions,
    bus: InputBus,
    audio: AudioEngine,
  ) {
    super(bus, audio, PLACEHOLDER_STATE);
    const ex = opts.exercise;
    this.tickMs = msPerTick(ex.bpm, ex.timeSignature);
    this.callBars = new Set(ex.rhythm.callBars);
    this.mutedBars = new Set(ex.rhythm.mutedBars);
    this.keys = new Map();
    if (ex.measures.some((m) => m.lh.length)) this.keys.set(ex.rhythm.lhKey, 'lh');
    if (ex.measures.some((m) => m.rh.length)) this.keys.set(ex.rhythm.rhKey, 'rh');
    // Echo: the notation of a call-and-response pair is revealed when its answer is over.
    this.lastResponseBars = [];
    for (let b = 0; b < ex.bars; b++) {
      if (!this.callBars.has(b) && (b === ex.bars - 1 || this.callBars.has(b + 1)) && this.callBars.size) this.lastResponseBars.push(b);
    }
    this.state.set(this.initialState());
  }

  get exercise(): Exercise {
    return this.opts.exercise;
  }

  get task() {
    return this.opts.exercise.rhythm.task;
  }

  private isCallStep(index: number): boolean {
    const step = this.opts.exercise.steps[index];
    return !!step && this.callBars.has(step.measureIndex);
  }

  private judgedSteps() {
    return this.opts.exercise.steps.filter((s) => !this.callBars.has(s.measureIndex));
  }

  private initialState(): PracticeState {
    const marks: Record<number, StepMark> = {};
    this.opts.exercise.steps.forEach((s) => {
      if (this.isCallStep(s.index)) marks[s.index] = 'call';
    });
    const first = this.judgedSteps()[0];
    return {
      status: 'ready',
      mode: 'flow',
      stepIndex: 0,
      expected: this.task === 'echo' ? [] : (first?.midis ?? []),
      revealed: [],
      countIn: null,
      beat: null,
      live: EMPTY_LIVE,
      marks,
      wrong: null,
      lastGrade: null,
      result: null,
      visibleBars: this.task === 'echo' ? 0 : undefined,
      rhythm: { phase: null },
    };
  }

  get msPerTick(): number {
    return this.tickMs;
  }

  start(): void {
    this.halt();
    const ex = this.opts.exercise;
    const ts = ex.timeSignature;
    const muted = this.mutedBars;
    this.clock = this.startCountIn({
      timeSignature: ts,
      tickMs: this.tickMs,
      countInBars: this.opts.countInBars,
      totalTicks: ex.totalTicks,
      volume: this.opts.metronomeVolume,
      muted: muted.size ? (beat, countIn) => beat >= countIn && muted.has(Math.floor((beat - countIn) / ts.beatsPerBar)) : undefined,
    });
    const t0 = this.clock.startTime;
    this.flow = new FlowEngine(this.judgedSteps(), {
      msPerTick: this.tickMs,
      latencyMs: this.opts.latencyMs,
      sustainCountsAsHeld: true,
      judgeReleases: false,
      endTick: ex.totalTicks,
    });
    this.flow.setStartTime(t0);
    this.marks.reset();
    if (this.callBars.size) {
      const calls = allEvents(ex)
        .filter((e) => e.pitches.length && this.callBars.has(e.measureIndex))
        .map((e) => ({
          at: e.startTick * this.tickMs,
          dur: Math.max(90, Math.min(e.durationTicks * this.tickMs * 0.85, 700)),
          midis: e.pitches.map((p) => p.midi),
        }));
      this.stopPlayback = this.audio.playSequence(calls, t0, this.opts.synthVolume);
    }
    this.state.set({ ...this.initialState(), status: 'countin', countIn: { beat: 0, total: this.clock.countInBeats } });
    this.runFrames(this.frame);
  }

  private halt() {
    this.stopFrames();
    this.metronome.stop();
    this.stopPlayback?.();
    this.stopPlayback = null;
  }

  stop(): void {
    this.halt();
    this.flow = null;
    this.state.set(this.initialState());
  }

  /** Bar index under the (visual) playhead; -1 during the count-in. */
  private barAt(tick: number): number {
    return tick < 0 ? -1 : Math.floor(tick / this.opts.exercise.timeSignature.ticksPerBar);
  }

  playheadTick(now = performance.now()): number | null {
    if (!this.flow) return null;
    const tick = (now - this.opts.playheadDelayMs - this.flow.startTime) / this.tickMs;
    // A moving playhead is a visual metronome: hide it while the click is silent.
    if (this.mutedBars.has(this.barAt(tick))) return null;
    return tick;
  }

  private phaseAt(bar: number): RhythmPhase | null {
    if (bar < 0 || bar >= this.opts.exercise.bars) return null;
    if (this.task === 'echo') return this.callBars.has(bar) ? 'call' : 'response';
    if (this.task === 'pulse') return this.mutedBars.has(bar) ? 'silent' : 'click';
    return null;
  }

  private frame = (): boolean => {
    const flow = this.flow;
    const clock = this.clock;
    if (!flow || !clock) return false;
    const now = performance.now();
    const visualNow = now - this.opts.playheadDelayMs;
    const ex = this.opts.exercise;
    const ts = ex.timeSignature;
    const s = this.state.get();
    if (visualNow < flow.startTime) {
      this.showCountIn(clock, visualNow);
    } else {
      const misses = flow.update(now);
      const tick = (visualNow - flow.startTime) / this.tickMs;
      const bar = this.barAt(tick);
      const silent = this.mutedBars.has(bar);
      const beatIndex = Math.floor(tick / ts.beatTicks) % ts.beatsPerBar;
      const judged = this.judgedSteps();
      let next = judged.find((st) => st.tick * this.tickMs >= tick * this.tickMs - flow.timing.perfectMs);
      if (this.task === 'echo' || silent) next = undefined;
      const patch: Partial<PracticeState> = {};
      if (s.status !== 'running') Object.assign(patch, { status: 'running', countIn: null });
      const beat = silent ? null : { index: beatIndex, beatsPerBar: ts.beatsPerBar };
      if (s.beat?.index !== beat?.index) patch.beat = beat;
      const stepIndex = next?.index ?? ex.steps.length;
      if (stepIndex !== s.stepIndex || (next?.midis ?? []).join() !== s.expected.join()) {
        Object.assign(patch, { stepIndex, expected: next?.midis ?? [] });
      }
      const phase = this.phaseAt(bar);
      if (phase !== (s.rhythm?.phase ?? null)) patch.rhythm = { phase };
      if (this.task === 'echo') {
        const hitTicks = flow.timing.hitMs / this.tickMs;
        let visible = 0;
        for (const b of this.lastResponseBars) if (tick > (b + 1) * ts.ticksPerBar + hitTicks) visible = b + 1;
        if (visible !== s.visibleBars) patch.visibleBars = visible;
      }
      if (misses.length) {
        const marks = { ...s.marks };
        for (const m of misses) if (m.type === 'miss') marks[m.stepIndex] = this.marks.miss(m.stepIndex);
        Object.assign(patch, { marks, live: flow.liveStats() });
      }
      if (Object.keys(patch).length) this.patch(patch);
      if (flow.isFinished(now)) {
        this.finish(flow.result({ exerciseId: ex.id, level: ex.meta.level, tierId: ex.meta.tierId, completedAt: Date.now() }));
        return false;
      }
    }
    return true;
  };

  private finish(raw: ExerciseResult) {
    const result = rhythmResult(this.opts.exercise, raw);
    this.halt();
    this.state.set({
      ...this.state.get(),
      status: 'finished',
      result,
      expected: [],
      beat: null,
      countIn: null,
      visibleBars: undefined,
      rhythm: { phase: null },
    });
    this.finished.emit(result);
  }

  /**
   * Echo: presses while the app is playing a call are not answers (tapping along is fine) —
   * unless they are within the timing window of an answer note (an early first note, say).
   */
  private inCall(time: number, flow: FlowEngine): boolean {
    if (!this.callBars.size) return false;
    const t = time - this.opts.latencyMs;
    const bar = Math.floor((t - flow.startTime) / this.tickMs / this.opts.exercise.timeSignature.ticksPerBar);
    if (!this.callBars.has(bar)) return false;
    return !this.judgedSteps().some((st) => Math.abs(t - flow.expectedTime(st.tick)) <= flow.timing.hitMs);
  }

  handleInput(ev: NoteInput): void {
    const s = this.state.get();
    const flow = this.flow;
    if (s.status === 'finished' || !flow) return;
    if (ev.kind !== 'noteOn') return; // onsets only; releases and pedal don't matter here
    if (!this.keys.has(ev.midi)) {
      this.state.set({ ...s, ...this.flash('wrong', { midi: ev.midi, at: performance.now() }, 400) });
      return;
    }
    // Ignore warm-up taps during the count-in.
    if (ev.time - this.opts.latencyMs < flow.startTime - flow.timing.hitMs) return;
    if (this.inCall(ev.time, flow)) return;
    let next = s;
    for (const f of flow.noteOn(ev.midi, ev.time)) {
      if (f.type === 'extra') next = { ...next, ...this.flash('wrong', { midi: f.midi, at: performance.now() }, 400) };
      if (f.type === 'hit') {
        const step = this.opts.exercise.steps[f.stepIndex];
        const mark = this.marks.hit(f.stepIndex, step?.notes.length ?? 1, f.grade === 'early' || f.grade === 'late');
        next = {
          ...next,
          marks: mark ? { ...next.marks, [f.stepIndex]: mark } : next.marks,
          ...this.flash('lastGrade', { grade: f.grade, deltaMs: f.deltaMs, at: performance.now() }, 900),
        };
      }
    }
    this.state.set({ ...next, live: flow.liveStats() });
  }

  dispose(): void {
    this.halt();
    super.dispose();
  }
}
