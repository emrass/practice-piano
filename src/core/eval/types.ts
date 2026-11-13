import type { Clef, Hand } from '../exercise';
import type { LessonId } from '../lessons';

export type PracticeMode = 'wait' | 'flow' | 'ear';

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
  /** Index of the step (onset) this note belongs to. */
  step?: number;
  /** Rhythm figure of the note's event (sight Flow and Rhythm mode). */
  figure?: string;
  /** Metric position of the onset: 'downbeat' | 'beat' | 'offbeat' | 'sixteenth'. */
  beat?: string;
  /** Rhythm Pulse: the metronome was silent in this note's bar. */
  muted?: boolean;
  /** Flow mode: key velocity of the hit (1–127). */
  velocity?: number;
}

/** Rhythm-mode measurements (docs/DIDACTICS.md §4.3). */
export interface RhythmSummary {
  task: 'read' | 'echo' | 'pulse';
  texture: string | null;
  /** Average signed offset of hits in ms (negative = rushing, positive = dragging). */
  tendencyMs: number | null;
  /** Standard deviation of the offsets in ms (lower = steadier). */
  steadinessMs: number | null;
  /** Pulse: average offset in silent bars minus the average in clicked bars. */
  driftMs: number | null;
  /** Hit rate and timing per hand (hand independence). */
  hands: Partial<Record<Hand, { notes: number; hitRate: number; timing: number | null }>>;
}

export interface ExerciseResult {
  /** Lesson type; absent on results created before lessons existed (= sight reading). */
  lesson?: LessonId;
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
  /** Ear training: extra listens after the first, and notes revealed by hints. */
  replays?: number;
  hints?: number;
  rhythm?: RhythmSummary;
  scale?: ScaleSummary;
}

/** Scales & arpeggios measurements (docs/DIDACTICS.md §4.4). */
export interface ScaleSummary {
  itemId: string;
  /** Tempo of the run in notes per minute, and the note value / beat it was played in. */
  npm: number;
  notesPerBeat: number;
  goalNpm: number;
  /** Flow: clean enough to move up the tempo ladder. */
  clean: boolean;
  /** Spread of timing offsets in ms (lower = more even). */
  steadinessMs: number | null;
  /** Velocity spread as a share of the mean (lower = more even); null without velocities. */
  velocitySpread: number | null;
  /** The thumb plays noticeably louder than the other fingers. */
  thumbAccent: boolean;
  /** Hands together: average onset difference between the hands (ms). */
  syncMs: number | null;
  /** Recurring timing bumps, worst first. */
  bumps: { label: string; hand: Hand; finger: number | null; crossing: 'thumb-under' | 'finger-over' | null; ms: number }[];
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
