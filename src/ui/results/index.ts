import type { ExerciseResult } from '../../core/eval/types';
import type { LessonId } from '../../core/lessons';
import { chordsResults } from './chords';
import { earResults } from './ear';
import { rhythmResults } from './rhythm';
import { scalesResults } from './scales';
import { sightResults } from './sight';
import type { ResultsView } from './types';

export type { ResultsView } from './types';

/** The results-card parts of every lesson. */
export const RESULTS_VIEWS: Record<LessonId, ResultsView> = {
  sight: sightResults,
  ear: earResults,
  rhythm: rhythmResults,
  scales: scalesResults,
  chords: chordsResults,
};

/** The view for a result; results without a lesson are sight reading. */
export function resultsView(result: ExerciseResult): ResultsView {
  return RESULTS_VIEWS[result.lesson ?? 'sight'];
}
