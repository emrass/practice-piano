import { median, type ChordsResult } from '../eval/types';
import { addObservation, MASTERY_ACCURACY } from './shared';
import type { LessonProgressRules, ProgressState } from './types';

export const chordsRules: LessonProgressRules<ChordsResult> = {
  isPass: (result) => (result.mode === 'flow' ? result.chords.clean : result.pitchAccuracy >= MASTERY_ACCURACY),
  recordObservations(stats, result) {
    // A sequence walks one known chord up and down: it says nothing about finding chords, so it
    // stays out of the weak-chord statistics (its own progress is the item's tempo ladder).
    if (result.chords.task === 'sequence') return;
    for (const o of result.chords.outcomes) {
      addObservation(stats, 'chordQuality', o.quality, o.correct, o.reactionMs, o.timingScore, o.deltaMs);
      addObservation(stats, 'chordRoot', String(o.rootPc), o.correct, o.reactionMs, o.timingScore, o.deltaMs);
      addObservation(stats, 'chordInversion', String(o.inversion), o.correct, o.reactionMs, o.timingScore, o.deltaMs);
      if (o.readHands) addObservation(stats, 'chordHands', o.readHands, o.correct, o.reactionMs, o.timingScore, o.deltaMs);
    }
  },
  // Results saved before `messy` existed fall back to the ladder's own 90% rule.
  ladderRun: ({ chords: c }) => ({ itemId: c.itemId, tempo: c.bpm, notesPerBeat: 1, goalTempo: c.goalBpm, clean: c.clean, messy: c.messy }),
  /** Relative to 60 bpm. */
  tempoRatio: (result) => result.chords.bpm / 60,
};

export interface WeakChordStat {
  dimension: 'chordQuality' | 'chordRoot' | 'chordInversion' | 'chordHands';
  key: string;
  attempts: number;
  accuracy: number;
  medianReactionMs: number | null;
  /** Higher = weaker. */
  score: number;
}

/**
 * Chord qualities, roots, inversions and reading hands (chords read in the treble, bass or both
 * staves) that are often wrong or slow to find. Slowness is relative to the player's own typical
 * reaction across all chords.
 */
export function findWeakChords(progress: ProgressState, minAttempts = 8, limit = 6): WeakChordStat[] {
  const dims = ['chordQuality', 'chordRoot', 'chordInversion', 'chordHands'] as const;
  const all = dims.flatMap((dimension) =>
    Object.entries(progress.stats[dimension] ?? {}).map(([key, agg]) => ({ dimension, key, agg })),
  );
  const overall = median(all.map((a) => median(a.agg.reactions)).filter((v): v is number => v !== null));
  return all
    .filter((a) => a.agg.attempts >= minAttempts)
    .map(({ dimension, key, agg }) => {
      const accuracy = agg.correct / agg.attempts;
      const med = median(agg.reactions);
      const slowness = med !== null && overall ? Math.max(0, med / overall - 1) : 0;
      return { dimension, key, attempts: agg.attempts, accuracy, medianReactionMs: med, score: (1 - accuracy) * 2 + slowness };
    })
    .filter((w) => w.accuracy < 0.85 || w.score > 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
