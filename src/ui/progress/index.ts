import type { LessonId } from '../../core/lessons';
import { ChordStats } from './chords';
import { EarSection } from './ear';
import { RhythmSection } from './rhythm';
import { RepertoireStats } from './scales';
import { SightSection } from './sight';
import type { ProgressView } from './types';

export type { ProgressSectionProps, ProgressView } from './types';
export { pct } from './format';

/**
 * The Progress tab's per-lesson parts. The sections live in one file per lesson; the table is kept
 * here (a `.ts` file) so those files export only components, as React fast refresh needs.
 */
export const PROGRESS_VIEWS: Record<LessonId, ProgressView> = {
  sight: {
    summary: { pitch: 'Pitch (last 20)', second: 'timing', secondLabel: 'Timing (Flow)', third: 'reaction' },
    Section: SightSection,
  },
  ear: {
    summary: { pitch: 'Found (last 20)', second: 'replays', secondLabel: 'Avg replays (last 20)', third: 'reaction' },
    Section: EarSection,
  },
  rhythm: {
    summary: { pitch: 'Hits (last 20)', second: 'timing', secondLabel: 'Timing (last 20)', third: 'tendency' },
    Section: RhythmSection,
  },
  scales: {
    summary: { pitch: 'Notes (last 20)', second: 'timing', secondLabel: 'Timing (last 20)', third: 'reaction' },
    Section: RepertoireStats,
  },
  chords: {
    summary: { pitch: 'Chords (last 20)', second: 'timing', secondLabel: 'Timing (last 20)', third: 'reaction' },
    Section: ChordStats,
  },
};
