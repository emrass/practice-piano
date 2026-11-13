import { HAND_CLEF, type Hand, type Step } from '../exercise';
import { type ExerciseResult, type LiveStats, type NoteResult, type ResultContext } from './types';

export interface FlowOptions {
  msPerTick: number;
  /**
   * How late the player's notes arrive relative to the click they hear (Bluetooth MIDI
   * and/or Bluetooth audio). Subtracted from every input timestamp before judging.
   */
  latencyMs: number;
  sustainCountsAsHeld: boolean;
  /** Flag clipped notes (default true). Rhythm mode only judges onsets. */
  judgeReleases?: boolean;
  /**
   * Tick at which the exercise ends (usually the end of the last bar). The run lasts until
   * then, so the last notes are held for their full value. Default: when the last note ends.
   */
  endTick?: number;
}

export type TimingGrade = 'perfect' | 'good' | 'early' | 'late';

export type FlowFeedback =
  | { type: 'hit'; uid: string; midi: number; stepIndex: number; deltaMs: number; grade: TimingGrade; score: number }
  | { type: 'extra'; midi: number }
  | { type: 'miss'; uid: string; midi: number; stepIndex: number }
  | { type: 'early-release'; uid: string; midi: number };

interface FlowNote {
  uid: string;
  midi: number;
  hand: Hand;
  stepIndex: number;
  tick: number;
  durationTicks: number;
  state: 'pending' | 'hit' | 'missed';
  deltaMs?: number;
  score?: number;
  onTime?: number;
  velocity?: number;
}

export interface TimingWindows {
  perfectMs: number;
  hitMs: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Timing tolerances scale with tempo but stay within humane bounds. */
export function timingWindows(msPerTick: number): TimingWindows {
  const quarterMs = msPerTick * 4;
  return {
    perfectMs: clamp(quarterMs * 0.12, 40, 75),
    hitMs: clamp(quarterMs * 0.45, 140, 320),
  };
}

export function timingScore(deltaMs: number, w: TimingWindows): number {
  const d = Math.abs(deltaMs);
  if (d <= w.perfectMs) return 1;
  if (d >= w.hitMs) return 0;
  return 1 - (0.75 * (d - w.perfectMs)) / (w.hitMs - w.perfectMs);
}

export function timingGrade(deltaMs: number, w: TimingWindows): TimingGrade {
  const d = Math.abs(deltaMs);
  if (d <= w.perfectMs) return 'perfect';
  if (d <= (w.perfectMs + w.hitMs) / 2) return 'good';
  return deltaMs < 0 ? 'early' : 'late';
}

/**
 * Flow Mode: notes are due at fixed times on a metronome grid. Each key press is matched
 * to the nearest still-pending expected note of the same pitch inside the hit window.
 * Unmatched presses are "extra" notes; notes whose window passes unplayed are "missed".
 */
export class FlowEngine {
  private t0 = 0;
  private readonly notes: FlowNote[];
  private readonly windows: TimingWindows;
  private extras = 0;
  private streak = 0;
  private bestStreak = 0;
  private sustainDown = false;
  private readonly activeHits = new Map<number, FlowNote>();
  private readonly pendingRelease = new Map<number, { note: FlowNote; releasedAt: number }>();
  private readonly earlyReleased = new Set<string>();
  private lastUpdate = 0;

  constructor(
    steps: readonly Step[],
    private readonly opts: FlowOptions,
  ) {
    this.windows = timingWindows(opts.msPerTick);
    // One key can only be pressed once at a time: two hands on the same key (contrary-motion
    // scales start in unison) are one expected note.
    this.notes = steps.flatMap((s) =>
      s.notes
        .map((n, i) => ({
          uid: `${s.index}:${i}`,
          midi: n.midi,
          hand: n.hand,
          stepIndex: s.index,
          tick: s.tick,
          durationTicks: n.durationTicks,
          state: 'pending' as const,
        }))
        .filter((n, i, all) => all.findIndex((o) => o.midi === n.midi) === i),
    );
  }

  /** Performance-clock time (ms) at which tick 0 (bar 1, beat 1) sounds. */
  setStartTime(t0: number): void {
    this.t0 = t0;
  }

  get startTime(): number {
    return this.t0;
  }

  get timing(): TimingWindows {
    return this.windows;
  }

  expectedTime(tick: number): number {
    return this.t0 + tick * this.opts.msPerTick;
  }

  /**
   * When the run is over: the end of the exercise (the last notes have sounded for their full
   * value), but never before the last onset's hit window has closed.
   */
  get endTime(): number {
    const lastOnset = this.notes.reduce((a, n) => Math.max(a, n.tick), 0);
    const lastEnd = this.notes.reduce((a, n) => Math.max(a, n.tick + n.durationTicks), 0);
    const endTick = this.opts.endTick ?? lastEnd;
    return Math.max(this.expectedTime(endTick), this.expectedTime(lastOnset) + this.windows.hitMs);
  }

  private adjust(time: number): number {
    return time - this.opts.latencyMs;
  }

  noteOn(midi: number, time: number, velocity?: number): FlowFeedback[] {
    const t = this.adjust(time);
    let best: FlowNote | null = null;
    let bestDelta = Infinity;
    for (const n of this.notes) {
      if (n.state !== 'pending' || n.midi !== midi) continue;
      const delta = t - this.expectedTime(n.tick);
      if (Math.abs(delta) <= this.windows.hitMs && Math.abs(delta) < Math.abs(bestDelta)) {
        best = n;
        bestDelta = delta;
      }
    }
    if (!best) {
      this.extras++;
      this.streak = 0;
      return [{ type: 'extra', midi }];
    }
    best.state = 'hit';
    best.deltaMs = bestDelta;
    best.score = timingScore(bestDelta, this.windows);
    best.onTime = time;
    best.velocity = velocity;
    this.activeHits.set(midi, best);
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    return [
      {
        type: 'hit',
        uid: best.uid,
        midi,
        stepIndex: best.stepIndex,
        deltaMs: bestDelta,
        grade: timingGrade(bestDelta, this.windows),
        score: best.score,
      },
    ];
  }

  noteOff(midi: number, time: number): FlowFeedback[] {
    const note = this.activeHits.get(midi);
    if (!note) return [];
    this.activeHits.delete(midi);
    if (this.opts.sustainCountsAsHeld && this.sustainDown) {
      this.pendingRelease.set(midi, { note, releasedAt: time });
      return [];
    }
    return this.judgeRelease(note, time);
  }

  setSustain(down: boolean, time: number): FlowFeedback[] {
    this.sustainDown = down;
    if (down) return [];
    const out: FlowFeedback[] = [];
    for (const { note } of this.pendingRelease.values()) out.push(...this.judgeRelease(note, time));
    this.pendingRelease.clear();
    return out;
  }

  private judgeRelease(note: FlowNote, releaseTime: number): FlowFeedback[] {
    if (note.onTime === undefined || this.opts.judgeReleases === false) return [];
    const heldMs = releaseTime - note.onTime;
    const expectedMs = note.durationTicks * this.opts.msPerTick;
    // Only flag clearly clipped notes (less than half their value, and noticeably short).
    if (heldMs < expectedMs * 0.5 && expectedMs - heldMs > 120 && !this.earlyReleased.has(note.uid)) {
      this.earlyReleased.add(note.uid);
      note.score = (note.score ?? 0) * 0.8;
      return [{ type: 'early-release', uid: note.uid, midi: note.midi }];
    }
    return [];
  }

  /** Call every animation frame; reports notes whose window has passed. */
  update(now: number): FlowFeedback[] {
    const t = this.adjust(now);
    this.lastUpdate = now;
    const out: FlowFeedback[] = [];
    for (const n of this.notes) {
      if (n.state === 'pending' && t > this.expectedTime(n.tick) + this.windows.hitMs) {
        n.state = 'missed';
        this.streak = 0;
        out.push({ type: 'miss', uid: n.uid, midi: n.midi, stepIndex: n.stepIndex });
      }
    }
    return out;
  }

  isFinished(now: number): boolean {
    return this.adjust(now) > this.endTime && this.notes.every((n) => n.state !== 'pending');
  }

  liveStats(): LiveStats {
    const hits = this.notes.filter((n) => n.state === 'hit');
    const missed = this.notes.filter((n) => n.state === 'missed').length;
    const judged = hits.length + missed + this.extras;
    return {
      correct: hits.length,
      wrong: this.extras,
      missed,
      streak: this.streak,
      bestStreak: this.bestStreak,
      accuracy: judged === 0 ? 1 : hits.length / judged,
      timing: hits.length ? hits.reduce((a, n) => a + (n.score ?? 0), 0) / hits.length : null,
    };
  }

  result(ctx: ResultContext): ExerciseResult {
    const hits = this.notes.filter((n) => n.state === 'hit');
    const missed = this.notes.filter((n) => n.state !== 'hit').length;
    const steps = new Map<number, boolean>();
    for (const n of this.notes) steps.set(n.stepIndex, (steps.get(n.stepIndex) ?? true) && n.state === 'hit');
    const notes: NoteResult[] = this.notes.map((n) => ({
      midi: n.midi,
      hand: n.hand,
      clef: HAND_CLEF[n.hand],
      correct: n.state === 'hit',
      deltaMs: n.deltaMs,
      timingScore: n.score,
      step: n.stepIndex,
      velocity: n.velocity,
    }));
    const total = this.notes.length;
    return {
      mode: 'flow',
      exerciseId: ctx.exerciseId,
      level: ctx.level,
      tierId: ctx.tierId,
      totalNotes: total,
      correctNotes: hits.length,
      wrongNotes: this.extras,
      missedNotes: missed,
      pitchAccuracy: total + this.extras === 0 ? 1 : hits.length / (total + this.extras),
      timingAccuracy: hits.length ? hits.reduce((a, n) => a + (n.score ?? 0), 0) / hits.length : 0,
      medianReactionMs: null,
      meanAbsTimingMs: hits.length ? hits.reduce((a, n) => a + Math.abs(n.deltaMs ?? 0), 0) / hits.length : null,
      cleanSteps: [...steps.values()].filter(Boolean).length,
      totalSteps: steps.size,
      durationMs: Math.max(0, this.lastUpdate - this.t0),
      notes,
      completedAt: ctx.completedAt,
    };
  }
}
