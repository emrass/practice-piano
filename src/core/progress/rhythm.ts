import type { NoteResult, RhythmResult } from '../eval/types';
import { RHYTHM_TIMING_PASS } from '../rhythm/analysis';
import { addObservation, MASTERY_ACCURACY } from './shared';
import type { Aggregate, LessonProgressRules, ProgressState, StatDimension } from './types';

/** Rhythm figure and beat position of a timed note — shared by Rhythm mode and sight reading in Flow mode. */
export function recordTimeObservations(stats: ProgressState['stats'], n: NoteResult): void {
  if (n.figure) addObservation(stats, 'rhythmFigure', n.figure, n.correct, undefined, n.timingScore, n.deltaMs);
  if (n.beat) addObservation(stats, 'beatPosition', n.beat, n.correct, undefined, n.timingScore, n.deltaMs);
}

export const rhythmRules: LessonProgressRules<RhythmResult> = {
  /** Mastery accuracy and the timing. */
  isPass: (result) => result.pitchAccuracy >= MASTERY_ACCURACY && (result.timingAccuracy ?? 0) >= RHYTHM_TIMING_PASS,
  recordObservations(stats, result) {
    for (const n of result.notes) {
      recordTimeObservations(stats, n);
      addObservation(stats, 'rhythmHand', n.hand, n.correct, undefined, n.timingScore, n.deltaMs);
      if (result.rhythm.texture) addObservation(stats, 'rhythmTexture', result.rhythm.texture, n.correct, undefined, n.timingScore, n.deltaMs);
    }
  },
};

export interface TimeStat {
  key: string;
  attempts: number;
  /** Share of notes hit inside the timing window. */
  accuracy: number;
  /** Average timing quality of the hits (0–1), null without hits. */
  timing: number | null;
  /** Average signed offset (ms): negative = rushing, positive = dragging. */
  tendencyMs: number | null;
  /** Spread of the offsets (ms). */
  steadinessMs: number | null;
}

export function timeStat(key: string, a: Aggregate): TimeStat {
  const n = a.offsetCount ?? 0;
  const meanOffset = n ? (a.offsetSum ?? 0) / n : null;
  const variance = n > 1 && meanOffset !== null ? Math.max(0, (a.offsetSqSum ?? 0) / n - meanOffset * meanOffset) : null;
  return {
    key,
    attempts: a.attempts,
    accuracy: a.correct / Math.max(1, a.attempts),
    timing: a.timingCount ? a.timingSum / a.timingCount : null,
    tendencyMs: meanOffset === null ? null : Math.round(meanOffset),
    steadinessMs: variance === null ? null : Math.round(Math.sqrt(variance)),
  };
}

export function timeStats(progress: ProgressState, dimension: StatDimension): TimeStat[] {
  return Object.entries(progress.stats[dimension] ?? {}).map(([k, a]) => timeStat(k, a));
}

/** Weakness score for a rhythm statistic: misses weigh most, then loose timing. */
function rhythmWeakness(t: TimeStat): number {
  return (1 - t.accuracy) * 2 + (1 - (t.timing ?? 0));
}

/**
 * Rhythm figures that are often missed or played loosely — shared by Rhythm mode and sight
 * reading in Flow mode (both draw from the same figure library).
 */
export function findWeakFigures(progress: ProgressState, minAttempts = 6, limit = 4): TimeStat[] {
  return timeStats(progress, 'rhythmFigure')
    .filter((t) => t.attempts >= minAttempts && (t.accuracy < 0.85 || (t.timing ?? 0) < 0.65))
    .sort((a, b) => rhythmWeakness(b) - rhythmWeakness(a))
    .slice(0, limit);
}
