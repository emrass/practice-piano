import { useCallback, useMemo, useState } from 'react';
import type { ProgressState } from '../../core/progress/progress';
import { dueItems, setLadder } from '../../core/repertoire/repertoire';
import type { LessonContext } from './types';

/**
 * Weak-spot focus of a lesson: worked out from progress when an exercise is made (not on
 * every progress change, so a run's results don't reshape the exercise on screen).
 */
export function useFocus<T>(ctx: LessonContext, compute: (progress: ProgressState) => T, empty: T): [T, () => void] {
  const [focus, setFocus] = useState<T>(() => (ctx.settings.weakSpotFocus ? compute(ctx.progress) : empty));
  const { progressRef } = ctx;
  // `compute` is a module-level function in every lesson, so it never changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refresh = useCallback(() => setFocus(compute(progressRef.current)), [progressRef]);
  return [focus, refresh];
}

export function randomFrom(options: readonly string[], not: string | null): string {
  const pool = options.filter((t) => t !== not);
  return pool[Math.floor(Math.random() * pool.length)] ?? options[0];
}

/**
 * Fixed-repertoire lessons (scales, chords): the item picked from the review queue, the
 * lesson's due items, and moving an item's tempo ladder by hand.
 */
export function useRepertoire(ctx: LessonContext, isLessonItem: (id: string) => boolean) {
  const due = useCallback(
    (progress: ProgressState) => dueItems(progress.repertoire, Date.now()).filter(isLessonItem),
    [isLessonItem],
  );
  const [reviewPick, setReviewPick] = useState<string | null>(() => due(ctx.progress)[0] ?? null);
  /** Bumped when the ladder is moved by hand, so the exercise is made again at the new tempo. */
  const [ladderToken, setLadderToken] = useState(0);
  const { progressRef, setProgress } = ctx;

  /** The next due item (not the current one when there is a choice). */
  const pickNext = useCallback(
    (current: string | null) => {
      const list = due(progressRef.current);
      setReviewPick(list.find((id) => id !== current) ?? list[0] ?? null);
    },
    [due, progressRef],
  );

  /** Move an item's ladder by `deltaBpm` (in its note value: notesPerBeat × bpm). */
  const changeTempo = useCallback(
    (ladder: { itemId: string; tempo: number; notesPerBeat: number }, deltaBpm: number) => {
      const cur = progressRef.current.repertoire[ladder.itemId];
      const next = {
        ...progressRef.current,
        repertoire: {
          ...progressRef.current.repertoire,
          [ladder.itemId]: setLadder(cur, (cur?.ladderTempo ?? ladder.tempo) + deltaBpm * ladder.notesPerBeat, Date.now()),
        },
      };
      progressRef.current = next;
      setProgress(next);
      setLadderToken((t) => t + 1);
    },
    [progressRef, setProgress],
  );

  const dueCount = useMemo(() => due(ctx.progress).length, [due, ctx.progress]);
  return { reviewPick, pickNext, changeTempo, ladderToken, dueCount };
}

/** Level lessons: one level up or down (and a new exercise at it). */
export function stepLevel(ctx: LessonContext, group: 'sight' | 'ear' | 'rhythm', direction: 1 | -1, next: () => void): void {
  const current = ctx.settings[group].level;
  const level = Math.min(100, Math.max(1, current + direction));
  if (level !== current) ctx.update({ [group]: { level } });
  next();
}
