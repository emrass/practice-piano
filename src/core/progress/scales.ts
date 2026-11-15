import type { ScalesResult } from '../eval/types';
import { addObservation, MASTERY_ACCURACY } from './shared';
import type { LessonProgressRules } from './types';

export const scalesRules: LessonProgressRules<ScalesResult> = {
  isPass: (result) => (result.mode === 'flow' ? result.scale.clean : result.pitchAccuracy >= MASTERY_ACCURACY),
  recordObservations(stats, result) {
    // Per-item data lives in `repertoire`; key familiarity is a shared tag (DIDACTICS §3).
    const key = result.scale.itemId.split('/')[1];
    addObservation(stats, 'scaleKey', key, result.pitchAccuracy >= MASTERY_ACCURACY, undefined, result.timingAccuracy ?? undefined);
  },
  ladderRun: ({ scale: s }) => ({ itemId: s.itemId, tempo: s.npm, notesPerBeat: s.notesPerBeat, goalTempo: s.goalNpm, clean: s.clean }),
  /** Relative to 4 notes per second. */
  tempoRatio: (result) => result.scale.npm / 240,
};
