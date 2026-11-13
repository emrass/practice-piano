import { allEvents, type Exercise } from '../../core/exercise';
import { FlowEngine } from '../../core/eval/flowEngine';
import type { ExerciseResult } from '../../core/eval/types';
import type { NoteInput } from '../../core/input/events';
import { msPerTick } from '../../core/music/rhythm';
import { rhythmResult } from '../../core/rhythm/analysis';
import type { RhythmExercise } from '../../core/rhythm/generator';
import { createStore, Emitter, type Store } from '../../lib/store';
import type { InputBus } from '../../input/inputBus';
import { type AudioEngine, Metronome } from '../../platform/audio/audioEngine';
import type { PracticeState, StepMark } from './PracticeController';
import type { Session } from './session';

export interface RhythmControllerOptions {
  exercise: RhythmExercise;
  latencyMs: number;
  playheadDelayMs: number;
  metronomeVolume: number;
  countInBars: number;
  /** Volume of the call playback in Echo. */
  synthVolume: number;
}

export type RhythmPhase = 'call' | 'response' | 'click' | 'silent';

const EMPTY_LIVE = { correct: 0, wrong: 0, missed: 0, streak: 0, bestStreak: 0, accuracy: 1, timing: null };

/**
 * Rhythm mode session (docs/DIDACTICS.md §4.3). Like Flow mode — count-in, metronome, timing
 * windows with latency compensation — plus the rhythm tasks: Echo plays call bars and reveals
 * the notation after each answer, Pulse silences the metronome (and the playhead) for whole bars.
 * Only the designated keys count; other keys only flash, so a stray note is never punished.
 */
export class RhythmController implements Session {
  readonly state: Store<PracticeState>;
  readonly finished = new Emitter<ExerciseResult>();
  private flow: FlowEngine | null = null;
  private readonly metronome: Metronome;
  private readonly tickMs: number;
  private readonly callBars: Set<number>;
  private readonly mutedBars: Set<number>;
  private readonly keys: Map<number, 'rh' | 'lh'>;
  private readonly lastResponseBars: number[];
  private raf = 0;
  private unsub: (() => void) | null = null;
  private countInStart = 0;
  private countInBeats = 0;
  private beatMs = 0;
  private stopPlayback: (() => void) | null = null;
  private flashTimers: ReturnType<typeof setTimeout>[] = [];
  private stepHits = new Map<number, { hit: number; missed: number; imperfect: boolean }>();

  constructor(
    private readonly opts: RhythmControllerOptions,
    private readonly bus: InputBus,
    private readonly audio: AudioEngine,
  ) {
    const ex = opts.exercise;
    this.metronome = new Metronome(audio);
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
    this.state = createStore<PracticeState>(this.initialState());
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

  attach(): () => void {
    this.unsub = this.bus.subscribe((ev) => this.handleInput(ev));
    return () => this.dispose();
  }

  get isActive(): boolean {
    const s = this.state.get().status;
    return s === 'countin' || s === 'running';
  }

  get msPerTick(): number {
    return this.tickMs;
  }

  start(): void {
    this.halt();
    const ex = this.opts.exercise;
    const ts = ex.timeSignature;
    this.audio.ensure();
    this.beatMs = this.tickMs * ts.beatTicks;
    const bars = Math.max(this.opts.countInBars, Math.ceil(3 / ts.beatsPerBar));
    this.countInBeats = bars * ts.beatsPerBar;
    this.countInStart = performance.now() + 250;
    const t0 = this.countInStart + this.countInBeats * this.beatMs;
    this.flow = new FlowEngine(this.judgedSteps(), {
      msPerTick: this.tickMs,
      latencyMs: this.opts.latencyMs,
      sustainCountsAsHeld: true,
      judgeReleases: false,
    });
    this.flow.setStartTime(t0);
    this.stepHits = new Map();
    const countIn = this.countInBeats;
    const muted = this.mutedBars;
    this.metronome.start({
      startTime: this.countInStart,
      beatMs: this.beatMs,
      beatsPerBar: ts.beatsPerBar,
      totalBeats: countIn + Math.ceil(ex.totalTicks / ts.beatTicks),
      volume: this.opts.metronomeVolume,
      muted: muted.size ? (beat) => beat >= countIn && muted.has(Math.floor((beat - countIn) / ts.beatsPerBar)) : undefined,
    });
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
    this.state.set({ ...this.initialState(), status: 'countin', countIn: { beat: 0, total: this.countInBeats } });
    this.loop();
  }

  private halt() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.metronome.stop();
    this.stopPlayback?.();
    this.stopPlayback = null;
  }

  stop(): void {
    this.halt();
    this.flow = null;
    this.state.set(this.initialState());
  }

  setMetronomeVolume(v: number): void {
    this.metronome.setVolume(v);
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

  private loop = () => {
    const flow = this.flow;
    if (!flow) return;
    const now = performance.now();
    const visualNow = now - this.opts.playheadDelayMs;
    const ex = this.opts.exercise;
    const ts = ex.timeSignature;
    const s = this.state.get();
    if (visualNow < flow.startTime) {
      const beat = visualNow < this.countInStart ? 0 : Math.floor((visualNow - this.countInStart) / this.beatMs) + 1;
      if (s.countIn?.beat !== beat) this.state.set({ ...s, status: 'countin', countIn: { beat, total: this.countInBeats } });
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
        for (const m of misses) {
          if (m.type !== 'miss') continue;
          const h = this.bumpStep(m.stepIndex, 'missed');
          marks[m.stepIndex] = h.hit === 0 ? 'missed' : 'bad';
        }
        Object.assign(patch, { marks, live: flow.liveStats() });
      }
      if (Object.keys(patch).length) this.state.set({ ...this.state.get(), ...patch });
      if (flow.isFinished(now)) {
        this.finish(flow.result({ exerciseId: ex.id, level: ex.meta.level, tierId: ex.meta.tierId, completedAt: Date.now() }));
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

  private flash<K extends 'wrong' | 'lastGrade'>(key: K, value: NonNullable<PracticeState[K]>, ms: number): Partial<PracticeState> {
    const timer = setTimeout(() => {
      if (this.state.get()[key] === value) this.state.set({ ...this.state.get(), [key]: null });
    }, ms);
    this.flashTimers.push(timer);
    if (this.flashTimers.length > 20) this.flashTimers.shift();
    return { [key]: value } as Partial<PracticeState>;
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
        const h = this.bumpStep(f.stepIndex, 'hit', f.grade === 'early' || f.grade === 'late');
        const complete = h.hit >= (step?.notes.length ?? 1);
        const mark: StepMark = h.missed > 0 ? 'bad' : complete ? (h.imperfect ? 'ok' : 'good') : (next.marks[f.stepIndex] ?? 'ok');
        next = {
          ...next,
          marks: complete || h.missed > 0 ? { ...next.marks, [f.stepIndex]: mark } : next.marks,
          ...this.flash('lastGrade', { grade: f.grade, deltaMs: f.deltaMs, at: performance.now() }, 900),
        };
      }
    }
    this.state.set({ ...next, live: flow.liveStats() });
  }

  dispose(): void {
    this.flashTimers.splice(0).forEach(clearTimeout);
    this.halt();
    this.unsub?.();
    this.unsub = null;
  }
}
