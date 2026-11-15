import type { EarResult } from '../eval/types';
import { addObservation, MASTERY_ACCURACY } from './shared';
import type { LessonProgressRules, ProgressState } from './types';

export const earRules: LessonProgressRules<EarResult> = {
  isPass: (result) => result.pitchAccuracy >= MASTERY_ACCURACY,
  replays: (result) => result.replays,
  /** Melodic intervals between single-note steps, and chord shapes. */
  recordObservations(stats, result) {
    const byStep = new Map<number, { midis: number[]; correct: boolean }>();
    for (const n of result.notes) {
      if (n.step === undefined) continue;
      const s = byStep.get(n.step) ?? { midis: [], correct: true };
      s.midis.push(n.midi);
      s.correct &&= n.correct;
      byStep.set(n.step, s);
    }
    const steps = [...byStep.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    steps.forEach((s, i) => {
      if (s.midis.length === 1) {
        const prev = steps[i - 1];
        if (prev?.midis.length === 1) {
          const semis = Math.min(12, Math.abs(s.midis[0] - prev.midis[0]));
          addObservation(stats, 'interval', String(semis), s.correct);
        }
      } else {
        const sorted = [...s.midis].sort((a, b) => a - b);
        const key = sorted.length === 2 ? `h${sorted[1] - sorted[0]}` : sorted.length === 3 ? 'triad' : 'seventh';
        addObservation(stats, 'harmony', key, s.correct);
      }
    });
  },
};

export const INTERVAL_NAMES = ['Unison', 'm2', 'M2', 'm3', 'M3', 'P4', 'Tritone', 'P5', 'm6', 'M6', 'm7', 'M7', 'Octave'] as const;

export interface WeakInterval {
  semitones: number;
  attempts: number;
  accuracy: number;
}

/** Melodic intervals the player consistently misses (ear training weak spots). */
export function findWeakIntervals(progress: ProgressState, minAttempts = 4, limit = 4): WeakInterval[] {
  return Object.entries(progress.stats.interval ?? {})
    .map(([k, a]) => ({ semitones: Number(k), attempts: a.attempts, accuracy: a.correct / Math.max(1, a.attempts) }))
    .filter((w) => w.attempts >= minAttempts && w.accuracy < 0.8)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);
}
