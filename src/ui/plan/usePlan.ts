import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ExerciseResult } from '../../core/eval/types';
import { LESSONS, type LessonId } from '../../core/lessons';
import { advance, isBlockDone, isFinished, isStarted, newDay, normalizePlanDay, recordRun, restoreBlock, skipBlock, type PlanDay } from '../../core/plan/day';
import { blockPatch, buildPlan, type PlanBlock, type PlanPrefs } from '../../core/plan/planner';
import { dayKey, type Award, type ProgressState } from '../../core/progress/progress';
import type { LessonSettings, Settings, SettingsPatch } from '../../core/settings';
import type { Continuation } from '../lessons/types';
import { profileRepository } from '../state/useProfile';

const GROUPS = ['sight', 'ear', 'rhythm', 'scales', 'chords'] as const satisfies readonly (keyof LessonSettings)[];

/** How a lesson is named inside a sentence or on a button: "Next: sight reading". */
export const LESSON_WORDS: Readonly<Record<LessonId, string>> = { sight: 'sight reading', ear: 'ear training', rhythm: 'rhythm', scales: 'scales', chords: 'chords' };

/** Two patches as one: lesson groups merge field by field, as settings do. */
export function mergePatches(a: SettingsPatch | undefined, b: SettingsPatch | undefined): SettingsPatch {
  const out: Record<string, unknown> = { ...a, ...b };
  for (const g of GROUPS) if (a?.[g] && b?.[g]) out[g] = { ...a[g], ...b[g] };
  return out as SettingsPatch;
}

/**
 * The part of a settings change that belongs to the block being played (the lessons' own
 * settings and the weak-spot focus), and the part every lesson shares (theme, piano, sound).
 * A block has its lesson, so a change of lesson is dropped.
 */
export function splitPatch(patch: SettingsPatch): { block: SettingsPatch; shared: SettingsPatch } {
  const block: Record<string, unknown> = {};
  const shared: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'lesson') continue;
    if (key === 'weakSpotFocus' || (GROUPS as readonly string[]).includes(key)) block[key] = value;
    else shared[key] = value;
  }
  return { block: block as SettingsPatch, shared: shared as SettingsPatch };
}

/**
 * Settings with a layer over them. A lesson group the layer does not touch keeps its identity,
 * and a touched one changes only with its two sources, as the lessons expect of their settings
 * (they make a new exercise when their group changes).
 */
function useLaidOver(s: Settings, layer: SettingsPatch | null): Settings {
  const sight = useGroup(s.sight, layer?.sight);
  const ear = useGroup(s.ear, layer?.ear);
  const rhythm = useGroup(s.rhythm, layer?.rhythm);
  const scales = useGroup(s.scales, layer?.scales);
  const chords = useGroup(s.chords, layer?.chords);
  return useMemo(() => (layer ? { ...s, ...layer, sight, ear, rhythm, scales, chords } : s), [s, layer, sight, ear, rhythm, scales, chords]);
}

function useGroup<T extends object>(own: T, over: Partial<T> | undefined): T {
  return useMemo(() => (over ? { ...own, ...over } : own), [own, over]);
}

interface PlanState {
  /** Today's plan, once it is loaded or made. */
  day: PlanDay | null;
  /** A block is on the stage (otherwise Today shows the plan page). */
  playing: boolean;
  /** What the player changed in each block, by block index. Kept for the session only. */
  changes: Readonly<Record<number, SettingsPatch>>;
}

export interface Plan {
  /** Today is the open way to practice. */
  open: boolean;
  day: PlanDay | null;
  playing: boolean;
  /** The block on the stage. */
  block: PlanBlock | null;
  /** The block on the stage right now, for a callback that has just moved the plan (start, next, skip). */
  blockNow: () => PlanBlock | null;
  /** The settings the lessons see: the block's laid over the player's own while it is played. */
  settings: Settings;
  /** A settings change. While a block is played, the lesson's part of it stays in today's plan. */
  update: (patch: SettingsPatch) => void;
  /** Open Today (the plan page), or go back to free practice. */
  setOpen: (open: boolean, patch?: SettingsPatch) => void;
  /** Put the block that is next on the stage. */
  start: () => void;
  /** Back to the plan page. */
  toPage: () => void;
  skip: () => void;
  /** Bring a skipped block back into today's plan. */
  restore: (index: number) => void;
  setPrefs: (prefs: PlanPrefs) => void;
  /** A finished run and what it earned. */
  record: (result: ExerciseResult, award: Award) => void;
  /** The lesson's way on, or the plan's own once the block has its runs. */
  continuation: (own: Continuation) => Continuation;
  /** The way on is the plan's: the block on the stage has its runs. */
  canMoveOn: () => boolean;
  /** On to the next block, or to the end of the plan. */
  next: () => void;
  /** Settings and progress were replaced (import, reset): today's plan starts over. */
  replaced: (settings: Settings, progress: ProgressState) => void;
}

/**
 * Today's practice: the plan, where the player is in it, and the seams through which it meets
 * the lessons. A block is played by the lesson's own runtime: the plan lays the block's settings
 * over the player's own, counts the results, and takes over the way on once the block is done.
 * Nothing here knows how a lesson works, and no lesson knows it is in a plan.
 */
export function usePlan(opts: { settings: Settings; progressRef: RefObject<ProgressState>; updateSettings: (patch: SettingsPatch) => void }): Plan {
  const { settings: s, progressRef, updateSettings } = opts;
  const [state, setState] = useState<PlanState>({ day: null, playing: false, changes: {} });
  // The latest state for the callbacks below, which may run twice in one event (leave, then update).
  const stateRef = useRef(state);
  const settingsRef = useRef(s);
  useLayoutEffect(() => {
    settingsRef.current = s;
  });
  const commit = useCallback((change: (prev: PlanState) => PlanState) => {
    const next = change(stateRef.current);
    stateRef.current = next;
    setState(next);
  }, []);

  /** A plan for today from what the app knows now. */
  const fresh = useCallback(
    (settings = settingsRef.current, progress = progressRef.current): PlanDay => {
      const now = new Date();
      return newDay(dayKey(now), settings.plan.minutes, buildPlan(progress, settings, settings.plan, now.getTime()));
    },
    [progressRef],
  );
  /** Today's plan: the saved one if it is today's and under way, otherwise a new one. */
  const current = useCallback((day: PlanDay | null): PlanDay => (day && day.day === dayKey(new Date()) && isStarted(day) ? day : fresh()), [fresh]);

  useEffect(() => {
    let canceled = false;
    void profileRepository.loadToday().then((raw) => {
      if (canceled) return;
      commit((prev) => ({ ...prev, day: current(normalizePlanDay(raw, dayKey(new Date()))) }));
    });
    return () => {
      canceled = true;
    };
  }, [commit, current]);
  const { day } = state;
  useEffect(() => {
    if (day) void profileRepository.saveToday(day);
  }, [day]);
  // An app left open overnight: coming back to it the next day, the plan page shows a new plan.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      commit((prev) => (prev.playing || !prev.day || prev.day.day === dayKey(new Date()) ? prev : { ...prev, day: fresh(), changes: {} }));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [commit, fresh]);

  const open = s.way === 'today';
  const playing = open && state.playing && !!day && !isFinished(day);
  const block = playing ? day.blocks[day.at] : null;
  const changed = playing ? state.changes[day.at] : undefined;
  const layer = useMemo(() => (block ? mergePatches(blockPatch(block), changed) : null), [block, changed]);
  const settings = useLaidOver(s, layer);

  const update = useCallback(
    (patch: SettingsPatch) => {
      const { day, playing } = stateRef.current;
      if (!playing || !day || isFinished(day)) return updateSettings(patch);
      const { block, shared } = splitPatch(patch);
      if (Object.keys(block).length) commit((prev) => ({ ...prev, changes: { ...prev.changes, [day.at]: mergePatches(prev.changes[day.at], block) } }));
      if (Object.keys(shared).length) updateSettings(shared);
    },
    [commit, updateSettings],
  );

  const setOpen = useCallback(
    (next: boolean, patch?: SettingsPatch) => {
      // Opening Today makes the plan again unless it is under way: free practice since may have changed what is due.
      commit((prev) => ({ ...prev, playing: false, day: next ? current(prev.day) : prev.day }));
      updateSettings({ ...patch, way: next ? 'today' : 'free' });
    },
    [commit, current, updateSettings],
  );
  const start = useCallback(() => {
    commit((prev) => {
      const day = current(prev.day);
      return isFinished(day) ? { ...prev, day } : { ...prev, day, playing: true };
    });
  }, [commit, current]);
  const toPage = useCallback(() => commit((prev) => ({ ...prev, playing: false })), [commit]);
  const skip = useCallback(() => {
    commit((prev) => {
      if (!prev.day) return prev;
      const day = skipBlock(prev.day);
      return { ...prev, day, playing: prev.playing && !isFinished(day) };
    });
  }, [commit]);
  const restore = useCallback((index: number) => commit((prev) => (prev.day ? { ...prev, day: restoreBlock(prev.day, index) } : prev)), [commit]);
  const setPrefs = useCallback(
    (prefs: PlanPrefs) => {
      updateSettings({ plan: prefs });
      // A plan that is under way keeps its blocks; the new choice makes tomorrow's.
      commit((prev) => (prev.day && isStarted(prev.day) ? prev : { ...prev, day: fresh({ ...settingsRef.current, plan: prefs }) }));
    },
    [commit, fresh, updateSettings],
  );
  const record = useCallback(
    (result: ExerciseResult, award: Award) => {
      commit((prev) => (prev.playing && prev.day ? { ...prev, day: recordRun(prev.day, result, award) } : prev));
    },
    [commit],
  );
  const blockNow = useCallback(() => {
    const { day, playing } = stateRef.current;
    return playing && day && !isFinished(day) ? day.blocks[day.at] : null;
  }, []);
  const canMoveOn = useCallback(() => {
    const { day, playing } = stateRef.current;
    return playing && !!day && isBlockDone(day);
  }, []);
  const next = useCallback(() => {
    commit((prev) => {
      if (!prev.playing || !prev.day) return prev;
      const moved = advance(prev.day);
      return { ...prev, day: moved, playing: !isFinished(moved) };
    });
  }, [commit]);
  const replaced = useCallback(
    (settings: Settings, progress: ProgressState) => commit(() => ({ day: fresh(settings, progress), playing: false, changes: {} })),
    [commit, fresh],
  );

  const blockDone = playing && isBlockDone(day);
  const upNext = playing ? (day.blocks[day.at + 1] ?? null) : null;
  const continuation = useCallback(
    (own: Continuation): Continuation => {
      if (!block || !blockDone) return own;
      const here = LESSONS[block.lesson].name;
      const next = upNext
        ? { label: `Next: ${LESSON_WORDS[upNext.lesson]}`, detail: `${here} is done for today. Up next: ${LESSON_WORDS[upNext.lesson]}, about ${upNext.minutes} min.` }
        : { label: 'Finish', detail: `${here} is done. That was the last block of today's plan.` };
      return { repeat: own.repeat, next, primary: 'next' };
    },
    [block, blockDone, upNext],
  );

  return { open, day, playing, block, blockNow, settings, update, setOpen, start, toPage, skip, restore, setPrefs, record, continuation, canMoveOn, next, replaced };
}
