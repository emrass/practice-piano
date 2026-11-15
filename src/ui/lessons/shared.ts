import { useCallback, useMemo, useState } from 'react';
import type { ProgressState } from '../../core/progress/progress';
import { dueItems, setLadder } from '../../core/repertoire/repertoire';
import type { LessonSettings, Settings, SettingsPatch } from '../../core/settings';
import type { LessonContext } from './types';

/**
 * Weak-spot focus of a lesson: worked out from progress when an exercise is made (not on
 * every progress change, so a run's results don't reshape the exercise on screen).
 */
export function useFocus<T>(ctx: LessonContext, compute: (progress: ProgressState) => T, empty: T): [T, () => void] {
  const [focus, setFocus] = useState<T>(() => (ctx.settings.weakSpotFocus ? compute(ctx.progress) : empty));
  const { progressRef } = ctx;
  const refresh = useCallback(() => setFocus(compute(progressRef.current)), [compute, progressRef]);
  return [focus, refresh];
}

/**
 * `build()`, made again only when a field of `key` changes: the key is the one place that says
 * what makes a new exercise or session. `build` reads everything else (progress, other settings)
 * as it is when it runs, so a change to those alone makes nothing new. Fields are compared one by
 * one with `Object.is`, like a dependency list: a fresh key object each render is fine, but each
 * field must keep its identity between renders (a setting, state, an earlier built value), not be
 * an object made during render. Unlike `useMemo`, the value is kept until the key changes.
 */
export function useBuiltFor<T>(key: Record<string, unknown>, build: () => T): T {
  const [built, setBuilt] = useState(() => ({ key, value: build() }));
  if (sameFields(built.key, key)) return built.value;
  // The key changed: keep the new value in state, set while rendering (React's pattern for
  // storing information from previous renders).
  const next = { key, value: build() };
  setBuilt(next);
  return next.value;
}

function sameFields(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const fields = Object.keys(a);
  return fields.length === Object.keys(b).length && fields.every((f) => Object.hasOwn(b, f) && Object.is(a[f], b[f]));
}

/** Session timing from the settings. The metronome volume is also applied live, so no session key lists it. */
export function flowTiming(s: Settings) {
  return { latencyMs: s.latencyMs, playheadDelayMs: s.playheadDelayMs, metronomeVolume: s.metronomeVolume, countInBars: s.countInBars };
}

/** How a Wait-mode session judges chords and held keys. */
export function waitOptions(s: Settings) {
  return { graceMs: s.chordGraceMs, sustainCountsAsHeld: s.sustainScoring === 'hold' };
}

/** How often each exercise id has been played (fresh material: unseen first). */
export function seenIn(progress: ProgressState): (id: string) => number {
  return (id) => progress.attempts[id] ?? 0;
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

/**
 * While a review item is on screen the lesson panel shows that item, not the player's own pick:
 * the item's fields are laid over the lesson's settings. Changing any of them goes back to
 * picking, starting from the reviewed item (so changing just the hands of a reviewed D major
 * scale gives D major with the new hands, not the old pick with them).
 */
export function reviewView<G extends 'scales' | 'chords'>(
  settings: Settings,
  update: (patch: SettingsPatch) => void,
  group: G,
  reviewed: Partial<LessonSettings[G]> | null,
): { settings: Settings; update: (patch: SettingsPatch) => void } {
  if (!reviewed) return { settings, update };
  const fields = Object.keys(reviewed);
  return {
    settings: { ...settings, [group]: { ...settings[group], ...reviewed } },
    update: (patch) => {
      const part = patch[group] as Partial<LessonSettings[G]> | undefined;
      if (!part || !Object.keys(part).some((k) => fields.includes(k))) return update(patch);
      update({ ...patch, [group]: { ...reviewed, ...part, source: 'pick' } });
    },
  };
}
