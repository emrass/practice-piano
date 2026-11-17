import type { Clef } from '../exercise';
import { median, type SightResult } from '../eval/types';
import { recordTimeObservations } from './rhythm';
import { addObservation, MASTERY_ACCURACY } from './shared';
import type { LessonProgressRules, ProgressState } from './types';

export function noteStatKey(clef: Clef, midi: number): string {
  return `${clef}:${midi}`;
}

export const sightRules: LessonProgressRules<SightResult> = {
  isPass: (result) => result.pitchAccuracy >= MASTERY_ACCURACY,
  recordObservations(stats, result) {
    for (const n of result.notes) {
      addObservation(stats, 'note', noteStatKey(n.clef, n.midi), n.correct, n.reactionMs, n.timingScore);
      addObservation(stats, 'clef', n.clef, n.correct, n.reactionMs, n.timingScore);
      // Rhythm figures are shared with Rhythm mode, but only Flow mode measures time.
      if (result.mode === 'flow') recordTimeObservations(stats, n);
    }
  },
};

export interface WeakNote {
  midi: number;
  clef: Clef;
  attempts: number;
  accuracy: number;
  medianReactionMs: number | null;
  /** Higher = weaker. */
  score: number;
}

export interface WeakSpots {
  notes: WeakNote[];
  clefs: { clef: Clef; accuracy: number; medianReactionMs: number | null; attempts: number }[];
  weakestClef: Clef | null;
}

/** Attempts a note needs before it is judged: listed as a weak spot, or colored in the heatmap. */
export const MIN_NOTE_ATTEMPTS = 4;

/**
 * Notes that are consistently missed or slow. A note needs a minimum number of attempts
 * so one slip doesn't flag it.
 */
export function findWeakSpots(progress: ProgressState, minAttempts = MIN_NOTE_ATTEMPTS, limit = 6): WeakSpots {
  const noteStats = progress.stats.note ?? {};
  const all = Object.entries(noteStats).map(([key, agg]) => {
    const [clef, midi] = key.split(':');
    return { clef: clef as Clef, midi: Number(midi), agg };
  });
  const reactionMedians = all.map((n) => median(n.agg.reactions)).filter((v): v is number => v !== null);
  const overallReaction = median(reactionMedians);
  const notes: WeakNote[] = all
    .filter((n) => n.agg.attempts >= minAttempts)
    .map((n) => {
      const accuracy = n.agg.correct / n.agg.attempts;
      const med = median(n.agg.reactions);
      const slowness = med !== null && overallReaction ? Math.max(0, med / overallReaction - 1) : 0;
      return { midi: n.midi, clef: n.clef, attempts: n.agg.attempts, accuracy, medianReactionMs: med, score: (1 - accuracy) * 2 + slowness };
    })
    .filter((n) => n.accuracy < 0.85 || n.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const clefs = (['treble', 'bass'] as Clef[])
    .map((clef) => {
      const agg = progress.stats.clef?.[clef];
      return agg
        ? { clef, accuracy: agg.correct / Math.max(1, agg.attempts), medianReactionMs: median(agg.reactions), attempts: agg.attempts }
        : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  const eligible = clefs.filter((c) => c.attempts >= minAttempts * 3);
  const weakestClef =
    eligible.length === 2 && Math.abs(eligible[0].accuracy - eligible[1].accuracy) > 0.03
      ? eligible.sort((a, b) => a.accuracy - b.accuracy)[0].clef
      : null;
  return { notes, clefs, weakestClef };
}

/** Per-MIDI accuracy across clefs, for the keyboard heatmap. */
export function noteHeatmap(progress: ProgressState, clef?: Clef): Map<number, { attempts: number; accuracy: number }> {
  const out = new Map<number, { attempts: number; correct: number }>();
  for (const [key, agg] of Object.entries(progress.stats.note ?? {})) {
    const [c, midi] = key.split(':');
    if (clef && c !== clef) continue;
    const m = Number(midi);
    const cur = out.get(m) ?? { attempts: 0, correct: 0 };
    cur.attempts += agg.attempts;
    cur.correct += agg.correct;
    out.set(m, cur);
  }
  return new Map([...out].map(([m, v]) => [m, { attempts: v.attempts, accuracy: v.correct / Math.max(1, v.attempts) }]));
}
