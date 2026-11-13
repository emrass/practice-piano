import type { ReactNode } from 'react';
import type { ExerciseResult } from '../../core/eval/types';
import type { Award } from '../../core/progress/progress';

/**
 * The lesson-specific parts of the results card. ResultsCard renders the shared chrome (ribbon, headline,
 * XP, tier progress, piano legend, buttons) and asks the lesson's view for these.
 */
export interface ResultsView {
  /** Ribbon text when passed / when not passed. */
  ribbon(result: ExerciseResult, passed: boolean): string;
  /** Big headline. */
  headline(result: ExerciseResult, passed: boolean, award: Award | null): string;
  /** The lesson's measurements (results grid, notes…), rendered as a component. */
  Body: (props: { result: ExerciseResult; award: Award | null }) => ReactNode;
  /** Label of the primary button, e.g. 'Next phrase'. */
  nextLabel: string;
  /** Repertoire lessons (scales, chords) have no tier block and no repeat-passage XP note. */
  repertoire: boolean;
  /** What new passages train, for the "Repeat passage — reduced XP. New passages train … best." note; null for repertoire. */
  trains: string | null;
  /** Extra lesson-specific notes under the XP total (shown after the repeat-passage note). */
  xpNotes?(result: ExerciseResult): string[];
}
