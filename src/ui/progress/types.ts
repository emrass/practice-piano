import type { ReactNode } from 'react';
import type { ProgressState } from '../../core/progress/progress';
import type { Settings } from '../../core/settings';

/** What the Progress tab asks of a lesson: its summary tile labels and its own section(s). */
export interface ProgressView {
  /** Summary tiles that differ per lesson (XP, streak and exercises are shared). */
  summary: {
    /** Label of the pitch-accuracy tile, e.g. "Pitch (last 20)". */
    pitch: string;
    /** Value of the second tile: timing accuracy, or average replays (ear training). */
    second: 'timing' | 'replays';
    secondLabel: string;
    /** Third tile: median reaction time, or the rushing/dragging tendency (rhythm). */
    third: 'reaction' | 'tendency';
  };
  /** The lesson's own section(s), rendered between the summary and "Your data". */
  Section: (props: ProgressSectionProps) => ReactNode;
}

export interface ProgressSectionProps {
  progress: ProgressState;
  settings: Settings;
  now: number;
  /** Review the lesson's due repertoire items (scales, chords). */
  onReview: () => void;
  onPracticeWeakSpots: () => void;
}
