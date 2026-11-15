import type { Aggregate, ProgressState, StatDimension } from './types';

/** Pitch accuracy a run needs to pass. */
export const MASTERY_ACCURACY = 0.9;
const MAX_REACTION_SAMPLES = 20;

export function emptyAggregate(): Aggregate {
  return { attempts: 0, correct: 0, reactions: [], timingSum: 0, timingCount: 0 };
}

export function addObservation(
  stats: ProgressState['stats'],
  dimension: StatDimension,
  key: string,
  correct: boolean,
  reactionMs?: number,
  timingScore?: number,
  offsetMs?: number,
): void {
  const dim = (stats[dimension] ??= {});
  const agg = (dim[key] ??= emptyAggregate());
  agg.attempts++;
  if (correct) agg.correct++;
  if (offsetMs !== undefined && correct) {
    agg.offsetSum = (agg.offsetSum ?? 0) + offsetMs;
    agg.offsetSqSum = (agg.offsetSqSum ?? 0) + offsetMs * offsetMs;
    agg.offsetCount = (agg.offsetCount ?? 0) + 1;
  }
  if (reactionMs !== undefined) {
    agg.reactions.push(Math.round(reactionMs));
    if (agg.reactions.length > MAX_REACTION_SAMPLES) agg.reactions.splice(0, agg.reactions.length - MAX_REACTION_SAMPLES);
  }
  if (timingScore !== undefined) {
    agg.timingSum += timingScore;
    agg.timingCount++;
  }
}
