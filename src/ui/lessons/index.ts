import type { LessonId } from '../../core/lessons';
import { useChordsLesson } from './chords';
import { useEarLesson } from './ear';
import { useRhythmLesson } from './rhythm';
import { useScalesLesson } from './scales';
import { useSightLesson } from './sight';
import type { LessonContext, LessonRuntime } from './types';

export type { LessonContext, LessonRuntime } from './types';

/**
 * The active lesson. Every lesson's hook runs on every render (hooks can't be called
 * conditionally), but only the active one builds an exercise; the others keep their small
 * state (review pick, shuffled key, weak-spot focus) and return null.
 */
export function useLesson(lesson: LessonId, ctx: LessonContext): LessonRuntime {
  const runtimes: Record<LessonId, LessonRuntime | null> = {
    sight: useSightLesson(ctx, lesson === 'sight'),
    ear: useEarLesson(ctx, lesson === 'ear'),
    rhythm: useRhythmLesson(ctx, lesson === 'rhythm'),
    scales: useScalesLesson(ctx, lesson === 'scales'),
    chords: useChordsLesson(ctx, lesson === 'chords'),
  };
  return runtimes[lesson]!;
}
