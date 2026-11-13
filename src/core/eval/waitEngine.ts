import { HAND_CLEF, type Step } from '../exercise';
import { type ExerciseResult, type LiveStats, median, type NoteResult, type ResultContext } from './types';

export interface WaitOptions {
  /** Chord notes pressed within this window of each other count as simultaneous. */
  graceMs: number;
  /** When true, keys released while the sustain pedal is down still count as held. */
  sustainCountsAsHeld: boolean;
}

export type WaitFeedback =
  | { type: 'hit'; midi: number; stepIndex: number }
  | { type: 'wrong'; midi: number; stepIndex: number }
  | { type: 'advance'; fromStep: number; toStep: number; reactionMs: number; clean: boolean }
  | { type: 'complete' };

/**
 * Wait Mode: the cursor sits on the current step until every expected key has been
 * played. A chord is accepted when all its notes are pressed within the grace window
 * of each other, or are all held down together (slow chord assembly is fine as long as
 * the keys stay down). Wrong keys are penalised but never advance the cursor.
 */
export class WaitEngine {
  private index = 0;
  private stepStart = 0;
  private startTime = 0;
  private endTime = 0;
  private started = false;
  private readonly physical = new Set<number>();
  private readonly sustained = new Set<number>();
  private sustainDown = false;
  /** Expected notes hit in the current attempt → press time. */
  private readonly attempt = new Map<number, number>();
  private stepHadError = false;

  private correct = 0;
  private wrong = 0;
  private streak = 0;
  private bestStreak = 0;
  private cleanSteps = 0;
  private assistedNotes = 0;
  private hints = 0;
  private stepAssisted = false;
  private readonly notes: NoteResult[] = [];
  private readonly reactions: number[] = [];

  constructor(
    private readonly steps: readonly Step[],
    private readonly opts: WaitOptions,
  ) {}

  start(time: number): void {
    this.started = true;
    this.startTime = time;
    this.stepStart = time;
    this.index = 0;
  }

  get isStarted(): boolean {
    return this.started;
  }

  get stepIndex(): number {
    return this.index;
  }

  get done(): boolean {
    return this.index >= this.steps.length;
  }

  get currentStep(): Step | undefined {
    return this.steps[this.index];
  }

  /** Expected notes of the current step that have already been played in this attempt. */
  get pendingHits(): number[] {
    return [...this.attempt.keys()];
  }

  private isHeld(midi: number): boolean {
    return this.physical.has(midi) || (this.opts.sustainCountsAsHeld && this.sustainDown && this.sustained.has(midi));
  }

  private prune(now: number): void {
    for (const [midi, t] of this.attempt) {
      if (now - t > this.opts.graceMs && !this.isHeld(midi)) this.attempt.delete(midi);
    }
  }

  noteOn(midi: number, time: number): WaitFeedback[] {
    this.physical.add(midi);
    this.sustained.delete(midi);
    if (!this.started) this.start(time);
    const step = this.currentStep;
    if (!step) return [];
    const out: WaitFeedback[] = [];
    if (!step.midis.includes(midi)) {
      this.wrong++;
      this.streak = 0;
      this.stepHadError = true;
      out.push({ type: 'wrong', midi, stepIndex: step.index });
      return out;
    }
    this.attempt.set(midi, time);
    this.prune(time);
    out.push({ type: 'hit', midi, stepIndex: step.index });
    if (step.midis.every((m) => this.attempt.has(m))) out.push(...this.completeStep(step, time));
    return out;
  }

  noteOff(midi: number, _time: number): void {
    this.physical.delete(midi);
    if (this.sustainDown) this.sustained.add(midi);
  }

  /**
   * The player asked for help on the current step (ear training hint): the step can no
   * longer count as found unaided, and its notes don't count toward accuracy.
   */
  assist(): void {
    if (this.done || this.stepAssisted) return;
    this.stepAssisted = true;
    this.stepHadError = true;
    this.hints++;
    this.streak = 0;
  }

  get hintCount(): number {
    return this.hints;
  }

  setSustain(down: boolean, _time: number): void {
    this.sustainDown = down;
    if (!down) this.sustained.clear();
  }

  private completeStep(step: Step, time: number): WaitFeedback[] {
    const reactionMs = Math.max(0, time - this.stepStart);
    const clean = !this.stepHadError;
    if (clean) this.cleanSteps++;
    // The first step's "reaction" includes getting ready; leave it out of the median.
    if (step.index > 0) this.reactions.push(reactionMs);
    for (const n of step.notes) {
      this.notes.push({
        midi: n.midi,
        hand: n.hand,
        clef: HAND_CLEF[n.hand],
        correct: clean,
        reactionMs: step.index > 0 ? reactionMs : undefined,
        step: step.index,
      });
    }
    if (this.stepAssisted) this.assistedNotes += step.midis.length;
    this.stepAssisted = false;
    this.correct += step.midis.length;
    this.streak += clean ? step.midis.length : 0;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.attempt.clear();
    this.stepHadError = false;
    const from = this.index;
    this.index++;
    this.stepStart = time;
    const out: WaitFeedback[] = [{ type: 'advance', fromStep: from, toStep: this.index, reactionMs, clean }];
    if (this.done) {
      this.endTime = time;
      out.push({ type: 'complete' });
    }
    return out;
  }

  liveStats(): LiveStats {
    const denom = this.correct + this.wrong;
    return {
      correct: this.correct - this.assistedNotes,
      wrong: this.wrong,
      missed: 0,
      streak: this.streak,
      bestStreak: this.bestStreak,
      accuracy: denom === 0 ? 1 : Math.max(0, this.correct - this.assistedNotes) / denom,
      timing: null,
    };
  }

  result(ctx: ResultContext): ExerciseResult {
    const totalNotes = this.steps.reduce((a, s) => a + s.notes.length, 0);
    const expected = this.steps.reduce((a, s) => a + s.midis.length, 0);
    const pitchAccuracy = expected + this.wrong === 0 ? 1 : Math.max(0, this.correct - this.assistedNotes) / (expected + this.wrong);
    return {
      mode: 'wait',
      exerciseId: ctx.exerciseId,
      level: ctx.level,
      tierId: ctx.tierId,
      totalNotes,
      correctNotes: this.notes.filter((n) => n.correct).length,
      wrongNotes: this.wrong,
      missedNotes: 0,
      pitchAccuracy: Math.min(1, pitchAccuracy),
      timingAccuracy: null,
      medianReactionMs: median(this.reactions),
      meanAbsTimingMs: null,
      cleanSteps: this.cleanSteps,
      totalSteps: this.steps.length,
      durationMs: Math.max(0, (this.endTime || this.stepStart) - this.startTime),
      notes: [...this.notes],
      completedAt: ctx.completedAt,
      hints: this.hints,
    };
  }
}
