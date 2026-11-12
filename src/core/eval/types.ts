import type { Clef, Hand } from '../exercise';

export type PracticeMode = 'wait' | 'flow';

export interface NoteResult {
  midi: number;
  hand: Hand;
  clef: Clef;
  /** Wait: read correctly on the first try. Flow: played on time (within the hit window). */
  correct: boolean;
  /** Wait mode: time from the step becoming current to completion. */
  reactionMs?: number;
  /** Flow mode: signed offset from the beat (negative = early), after latency compensation. */
  deltaMs?: number;
  /** Flow mode: 0–1 rhythmic quality of a hit. */
  timingScore?: number;
}

export interface ExerciseResult {
  mode: PracticeMode;
  exerciseId: string;
  level: number;
  tierId: string;
  totalNotes: number;
  correctNotes: number;
  /** Wrong / extra key presses. */
  wrongNotes: number;
  /** Flow mode: expected notes that were never played. */
  missedNotes: number;
  /** 0–1 */
  pitchAccuracy: number;
  /** 0–1, Flow mode only. */
  timingAccuracy: number | null;
  medianReactionMs: number | null;
  meanAbsTimingMs: number | null;
  cleanSteps: number;
  totalSteps: number;
  durationMs: number;
  notes: NoteResult[];
  completedAt: number;
}

export interface LiveStats {
  correct: number;
  wrong: number;
  missed: number;
  streak: number;
  bestStreak: number;
  /** 0–1, running pitch accuracy */
  accuracy: number;
  /** 0–1 or null (Flow mode only) */
  timing: number | null;
}

export interface ResultContext {
  exerciseId: string;
  level: number;
  tierId: string;
  completedAt: number;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
