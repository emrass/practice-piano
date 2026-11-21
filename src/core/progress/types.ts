import type { ExerciseResult, PracticeMode } from '../eval/types';
import type { LessonId } from '../lessons';
import type { LadderRun, RepertoireItem } from '../repertoire/repertoire';

/**
 * Generic per-key aggregate. Stats are stored as dimension → key → Aggregate so that new
 * weakness dimensions (intervals, accidentals, key signatures, rhythm patterns…) can be
 * added later without a schema change or touching lesson logic.
 */
export interface Aggregate {
  attempts: number;
  correct: number;
  /** Most recent reaction times (ms), for medians. */
  reactions: number[];
  timingSum: number;
  timingCount: number;
  /** Signed timing offsets (ms) of hits — tendency (mean) and steadiness (spread). */
  offsetSum?: number;
  offsetSqSum?: number;
  offsetCount?: number;
}

/**
 * Sight reading records 'note' (key = "treble:60") and 'clef' (key = "treble").
 * Ear training records 'interval' (melodic, key = semitones "0"–"12") and 'harmony'
 * (key = "h4" for a dyad of 4 semitones, "triad", "seventh").
 * Rhythm (and sight reading in Flow mode) records 'rhythmFigure' (key = figure, e.g. "6,2"),
 * 'beatPosition' (downbeat / beat / offbeat / sixteenth); Rhythm also 'rhythmHand' and
 * 'rhythmTexture'. Scales record 'scaleKey'; chords 'chordQuality' (maj, m7…), 'chordRoot'
 * (pitch class "0"–"11"), 'chordInversion' ("0"–"3") and, for chords read from notation,
 * 'chordHands' ("rh", "lh", "both").
 */
export type StatDimension =
  | 'note'
  | 'clef'
  | 'interval'
  | 'harmony'
  | 'rhythmFigure'
  | 'beatPosition'
  | 'rhythmHand'
  | 'rhythmTexture'
  | 'scaleKey'
  | 'chordQuality'
  | 'chordRoot'
  | 'chordInversion'
  | 'chordHands';

export interface TierProgress {
  attempts: number;
  passes: number;
  /** Ids of distinct passages passed (mastery needs different passages, not repeats). */
  passedExercises: string[];
  bestAccuracy: number;
  mastered: boolean;
  masteredAt?: number;
}

export interface DayLog {
  exercises: number;
  xp: number;
  practiceMs: number;
}

export interface HistoryEntry {
  at: number;
  lesson: LessonId;
  replays?: number;
  exerciseId: string;
  mode: PracticeMode;
  level: number;
  tierId: string;
  pitchAccuracy: number;
  timingAccuracy: number | null;
  medianReactionMs: number | null;
  xp: number;
  firstSight: boolean;
  passed: boolean;
}

export interface ProgressState {
  schemaVersion: number;
  xp: number;
  exercisesCompleted: number;
  streak: { current: number; best: number; lastDay: string | null };
  days: Record<string, DayLog>;
  tiers: Record<string, TierProgress>;
  stats: Record<string, Record<string, Aggregate>>;
  /** exerciseId → completed attempts (for the first-sight bonus). */
  attempts: Record<string, number>;
  history: HistoryEntry[];
  /** Fixed-repertoire items (scales, chords): tempo ladder and review schedule. */
  repertoire: Record<string, RepertoireItem>;
}

/**
 * What progress.ts asks of a lesson. XP, streaks, history and tier / repertoire bookkeeping are
 * shared; each lesson brings its pass rule and the weakness statistics it records, typed on its
 * own result variant.
 */
export interface LessonProgressRules<R extends ExerciseResult = ExerciseResult> {
  /** Whether the run passed: counts towards mastery and earns the first-sight bonus. */
  isPass(result: R): boolean;
  /** Adds the run's observations to the weakness statistics. */
  recordObservations(stats: ProgressState['stats'], result: R): void;
  /** Extra listens after the first (ear training): each costs a little XP; kept in the history. */
  replays?(result: R): number;
  /** Repertoire lessons: what the run tells the item's tempo ladder. */
  ladderRun?(result: R): LadderRun;
  /** Repertoire lessons: the run's tempo relative to the tempo that earns the base XP. */
  tempoRatio?(result: R): number;
}
