import { chordResult } from '../../core/chords/analysis';
import { pitchLabel } from '../../core/music/pitch';
import { bassOf } from '../../core/chords/catalog';
import { ChordFlowEngine, type ChordJudgement, ChordWaitEngine } from '../../core/chords/engine';
import type { ChordExercise } from '../../core/chords/generator';
import type { TimingGrade } from '../../core/eval/flowEngine';
import type { LiveStats } from '../../core/eval/types';
import type { NoteInput } from '../../core/input/events';
import { msPerTick } from '../../core/music/rhythm';
import type { InputBus } from '../../input/inputBus';
import type { AudioEngine } from '../../platform/audio/audioEngine';
import type { PracticeState, StepMark } from './session';
import { EMPTY_LIVE, type FlowClock, SessionBase } from './sessionBase';

export interface ChordPracticeOptions {
  exercise: ChordExercise;
  mode: 'wait' | 'flow';
  goalBpm: number;
  latencyMs: number;
  playheadDelayMs: number;
  metronomeVolume: number;
  countInBars: 1 | 2;
}

const pc = (m: number) => ((m % 12) + 12) % 12;
const REVEAL_AFTER_MS = 5000;

/**
 * Chords & progressions: one chord per bar. Wait waits for each chord (any voicing that has
 * exactly its notes, and the right bass where asked); Flow wants it on the downbeat with the
 * metronome. Shares the practice state shape, so score, bar, keyboard and results just work.
 */
export class ChordController extends SessionBase {
  private wait: ChordWaitEngine | null = null;
  private flow: ChordFlowEngine | null = null;
  private clock: FlowClock | null = null;
  private readonly tickMs: number;
  private readonly barMs: number;
  private firstInputAt: number | null = null;
  private revealTimer: ReturnType<typeof setTimeout> | null = null;
  /** Flow: keys outside the chord pressed inside a chord's window. */
  private wrongFlows = 0;

  constructor(
    private readonly opts: ChordPracticeOptions,
    bus: InputBus,
    audio: AudioEngine,
  ) {
    super(bus, audio, initialState(opts));
    this.tickMs = msPerTick(opts.exercise.bpm, opts.exercise.timeSignature);
    this.barMs = this.tickMs * opts.exercise.timeSignature.ticksPerBar;
    if (opts.mode === 'wait') this.resetWait();
  }

  get exercise(): ChordExercise {
    return this.opts.exercise;
  }

  get isActive(): boolean {
    const s = this.state.get().status;
    return this.opts.mode === 'flow' && (s === 'countin' || s === 'running');
  }

  private targetKeys(i: number): number[] {
    return targetKeys(this.opts.exercise, i);
  }

  private scheduleReveal(i: number) {
    if (this.revealTimer) clearTimeout(this.revealTimer);
    this.revealTimer = setTimeout(() => this.reveal(i), REVEAL_AFTER_MS);
  }

  private reveal(i: number) {
    const s = this.state.get();
    if (s.status !== 'running' || s.stepIndex !== i || s.expected.length) return;
    this.state.set({ ...s, expected: this.targetKeys(i) });
  }

  private resetWait() {
    this.wait = new ChordWaitEngine(this.opts.exercise.chords.targets);
    this.wait.start(performance.now());
    this.firstInputAt = null;
    this.state.set({ ...initialState(this.opts), status: 'running' });
    this.scheduleReveal(0);
  }

  start(): void {
    this.stopFrames();
    this.metronome.stop();
    if (this.opts.mode === 'wait') return this.resetWait();
    const ex = this.opts.exercise;
    this.clock = this.startCountIn({
      timeSignature: ex.timeSignature,
      tickMs: this.tickMs,
      countInBars: this.opts.countInBars,
      totalTicks: ex.totalTicks,
      volume: this.opts.metronomeVolume,
    });
    this.flow = new ChordFlowEngine(ex.chords.targets, { barMs: this.barMs, latencyMs: this.opts.latencyMs });
    this.flow.setStartTime(this.clock.startTime);
    this.wrongFlows = 0;
    this.state.set({ ...initialState(this.opts), status: 'countin', countIn: { beat: 0, total: this.clock.countInBeats } });
    this.runFrames(this.frame);
  }

  stop(): void {
    this.stopFrames();
    this.metronome.stop();
    this.flow = null;
    if (this.opts.mode === 'flow') this.state.set(initialState(this.opts));
  }

  playheadTick(now = performance.now()): number | null {
    if (!this.flow) return null;
    return (now - this.opts.playheadDelayMs - this.flow.startTime) / this.tickMs;
  }

  private live(results: readonly ChordJudgement[], wrong: number): LiveStats {
    let streak = 0;
    let best = 0;
    for (const r of results) {
      streak = r.correct ? streak + 1 : 0;
      best = Math.max(best, streak);
    }
    const correct = results.filter((r) => r.correct).length;
    const timed = results.filter((r) => r.correct && r.timingScore !== undefined);
    return {
      correct,
      wrong,
      missed: this.opts.mode === 'flow' ? results.length - correct : 0,
      streak,
      bestStreak: best,
      accuracy: results.length ? correct / results.length : 1,
      timing: timed.length ? timed.reduce((a, r) => a + r.timingScore!, 0) / timed.length : null,
    };
  }

  private grade(j: ChordJudgement, perfectMs: number): TimingGrade {
    const d = j.deltaMs ?? 0;
    if (Math.abs(d) <= perfectMs) return 'perfect';
    if (Math.abs(d) <= 2.5 * perfectMs) return 'good';
    return d < 0 ? 'early' : 'late';
  }

  private frame = (): boolean => {
    const flow = this.flow;
    const clock = this.clock;
    if (!flow || !clock) return false;
    const now = performance.now();
    const visualNow = now - this.opts.playheadDelayMs;
    const ts = this.opts.exercise.timeSignature;
    const beatMs = clock.beatMs;
    const s = this.state.get();
    if (visualNow < flow.startTime) {
      this.showCountIn(clock, visualNow);
    } else {
      const judged = flow.update(now);
      const n = this.opts.exercise.chords.targets.length;
      const beatIndex = Math.floor((visualNow - flow.startTime) / beatMs) % ts.beatsPerBar;
      // Guide: the chord whose bar is coming up (shown a little before the bar line).
      const idx = Math.min(n, Math.max(0, Math.floor((visualNow - flow.startTime + flow.preMs) / this.barMs)));
      const next: Partial<PracticeState> = {};
      if (s.status !== 'running') Object.assign(next, { status: 'running', countIn: null });
      if (s.beat?.index !== beatIndex) next.beat = { index: beatIndex, beatsPerBar: ts.beatsPerBar };
      if (idx !== s.stepIndex) Object.assign(next, { stepIndex: idx, expected: guideFor(this.opts, idx), chords: { index: idx, bassHint: null } });
      if (judged.length) {
        const marks = { ...s.marks };
        for (const j of judged) {
          const grade = this.grade(j, flow.perfectMs);
          marks[j.index] = !j.correct ? 'missed' : grade === 'perfect' || grade === 'good' ? 'good' : 'ok';
          if (j.correct) Object.assign(next, this.flash('lastGrade', { grade, deltaMs: j.deltaMs ?? 0, at: performance.now() }, 900));
        }
        Object.assign(next, { marks, live: this.live(flow.results, this.wrongFlows) });
      }
      if (Object.keys(next).length) this.patch(next);
      if (flow.isFinished(now)) {
        this.finish(flow.results, this.wrongFlows + flow.extraPresses(), n * this.barMs);
        return false;
      }
    }
    return true;
  };

  handleInput(ev: NoteInput): void {
    if (this.state.get().status === 'finished') return;
    if (this.opts.mode === 'wait') this.handleWait(ev);
    else this.handleFlow(ev);
  }

  private handleWait(ev: NoteInput) {
    const w = this.wait;
    if (!w || (ev.kind !== 'noteOn' && ev.kind !== 'noteOff')) return;
    if (ev.kind === 'noteOn') this.firstInputAt ??= ev.time;
    const r = ev.kind === 'noteOn' ? w.noteOn(ev.midi, ev.time) : w.noteOff(ev.midi, ev.time);
    let s = this.state.get();
    if (r.type === 'wrong' && ev.kind === 'noteOn') {
      s = { ...s, expected: this.targetKeys(w.index), ...this.flash('wrong', { midi: ev.midi, at: performance.now() }, 500) };
    }
    if (r.type === 'bass') {
      const t = this.opts.exercise.chords.targets[w.index];
      s = { ...s, expected: this.targetKeys(w.index), chords: { index: w.index, bassHint: `Right notes — put ${pitchLabel(bassOf(t.spec))} in the bass` } };
    }
    if (r.type === 'match' && r.judgement) {
      const j = r.judgement;
      const mark: StepMark = j.correct ? 'good' : 'ok';
      s = {
        ...s,
        stepIndex: w.index,
        expected: [],
        marks: { ...s.marks, [j.index]: mark },
        chords: { index: w.index, bassHint: null },
      };
    }
    this.state.set({ ...s, live: this.live(w.results, w.wrongPresses) });
    if (r.type === 'match' && !w.finished) this.scheduleReveal(w.index);
    if (w.finished) this.finish(w.results, w.wrongPresses, ev.time - (this.firstInputAt ?? ev.time));
  }

  private handleFlow(ev: NoteInput) {
    const flow = this.flow;
    if (!flow) return;
    if (ev.kind === 'noteOff') return flow.noteOff(ev.midi, ev.time);
    if (ev.kind !== 'noteOn') return;
    // Warm-up noodling during the count-in is ignored.
    if (ev.time - this.opts.latencyMs < flow.startTime - flow.preMs) return;
    flow.noteOn(ev.midi, ev.time);
    const i = flow.windowAt(ev.time);
    const t = i === null ? null : this.opts.exercise.chords.targets[i];
    if (t && !t.pcs.includes(pc(ev.midi))) {
      this.wrongFlows++;
      this.state.set({ ...this.state.get(), ...this.flash('wrong', { midi: ev.midi, at: performance.now() }, 500) });
    }
  }

  private finish(results: readonly ChordJudgement[], wrongPresses: number, durationMs: number) {
    const ex = this.opts.exercise;
    const result = chordResult(ex, results, {
      mode: this.opts.mode,
      goalBpm: this.opts.goalBpm,
      durationMs: Math.max(0, Math.round(durationMs)),
      wrongPresses,
      completedAt: Date.now(),
    });
    this.stopFrames();
    this.metronome.stop();
    if (this.revealTimer) clearTimeout(this.revealTimer);
    this.state.set({ ...this.state.get(), status: 'finished', result, expected: [], beat: null, countIn: null, live: this.live(results, wrongPresses) });
    this.finished.emit(result);
  }

  dispose(): void {
    if (this.revealTimer) clearTimeout(this.revealTimer);
    super.dispose();
  }
}

function targetKeys(ex: ChordExercise, i: number): number[] {
  const t = ex.chords.targets[i];
  if (!t) return [];
  return t.bassMidi !== null ? [t.bassMidi, ...t.voicing] : [...t.voicing];
}

/**
 * The keyboard guide would give the answer away, so it is help for when you are stuck:
 * Wait shows it after a few seconds or a wrong key; Flow only for progressions.
 */
function guideFor(opts: ChordPracticeOptions, i: number): number[] {
  return opts.mode === 'flow' && opts.exercise.chords.item.task === 'progression' ? targetKeys(opts.exercise, i) : [];
}

function initialState(opts: ChordPracticeOptions): PracticeState {
  return {
    status: 'ready',
    mode: opts.mode,
    stepIndex: 0,
    expected: guideFor(opts, 0),
    countIn: null,
    beat: null,
    live: EMPTY_LIVE,
    marks: {},
    wrong: null,
    lastGrade: null,
    result: null,
    chords: { index: 0, bassHint: null },
  };
}
