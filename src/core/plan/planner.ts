import { parseChordItemId } from '../chords/catalog';
import { figureName } from '../generator/rhythm';
import { LESSON_IDS, type LessonId } from '../lessons';
import { midiLabel } from '../music/pitch';
import { findWeakIntervals } from '../progress/ear';
import { findWeakFigures } from '../progress/rhythm';
import { findWeakSpots } from '../progress/sight';
import type { ProgressState } from '../progress/types';
import { dueItems } from '../repertoire/repertoire';
import { itemTitle, parseItemId } from '../scales/catalog';
import type { Settings, SettingsPatch } from '../settings';

/**
 * Today's practice (DIDACTICS §7): a short plan of blocks, one lesson each, made from what the
 * app already knows. Due repertoire first, then reading at the level last passed, then hearing
 * and rhythm, weakest or longest unpracticed first. Pure: the same progress, settings and time
 * give the same plan.
 */

export const PLAN_MINUTES = [10, 20, 30] as const;
export type PlanMinutes = (typeof PLAN_MINUTES)[number];

/** What the player chose for the plan: how long it is and which lessons it draws from. */
export interface PlanPrefs {
  minutes: PlanMinutes;
  lessons: Record<LessonId, boolean>;
}

export const DEFAULT_PLAN_PREFS: PlanPrefs = {
  minutes: 20,
  lessons: { sight: true, ear: true, rhythm: true, scales: true, chords: true },
};

/**
 * How a block sets its lesson up: `review` plays the due items, `weak-spots` features what the
 * player misses most, `plain` plays the lesson as it stands.
 */
export type BlockStart = 'review' | 'weak-spots' | 'plain';

export interface PlanBlock {
  lesson: LessonId;
  start: BlockStart;
  /** Sight reading, ear training and rhythm: the level the block is played at. */
  level: number | null;
  /** Finished runs the block asks for. */
  exercises: number;
  /** Estimated length, for the plan's readout. */
  minutes: number;
  /** Why the block is in the plan and what it features, in the app's own words. */
  reason: string;
}

/** Minutes one run takes with the time around it (reading the result, moving on). */
const MINUTES_EACH: Record<LessonId, number> = { scales: 1.5, chords: 2, sight: 2, rhythm: 1.5, ear: 1.5 };

/** Runs per slot for each length: warm-up, reading, the two listening and rhythm slots, chords. */
const SHAPE: Record<PlanMinutes, { warmup: number; reading: number; third: number; fourth: number; chords: number }> = {
  10: { warmup: 2, reading: 2, third: 2, fourth: 0, chords: 0 },
  20: { warmup: 3, reading: 4, third: 3, fourth: 2, chords: 0 },
  30: { warmup: 4, reading: 5, third: 3, fourth: 3, chords: 3 },
};
const MAX_BLOCK_EXERCISES = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

type LevelLesson = 'sight' | 'ear' | 'rhythm';

/**
 * The level a block is played at: the level of the lesson's last passed run. The level set in
 * free practice does not count until a run at it passes, so trying something far too hard there
 * leaves the plan where the player really is. Before any pass it is the lesson's starting level.
 */
export function planLevel(progress: ProgressState, settings: Settings, lesson: LevelLesson): number {
  for (let i = progress.history.length - 1; i >= 0; i--) {
    const h = progress.history[i];
    if (h.lesson === lesson && h.passed) return h.level;
  }
  return settings[lesson].level;
}

function lastPlayedAt(progress: ProgressState, lesson: LessonId): number | null {
  for (let i = progress.history.length - 1; i >= 0; i--) if (progress.history[i].lesson === lesson) return progress.history[i].at;
  return null;
}

const isScaleItem = (id: string) => parseItemId(id) !== null;
const isChordItem = (id: string) => parseChordItemId(id) !== null;

function list(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function minutesFor(lesson: LessonId, exercises: number): number {
  return Math.max(1, Math.round(exercises * MINUTES_EACH[lesson]));
}

/** A block while the plan is being fitted to its length: the reason can name the final number of runs. */
interface Draft extends Omit<PlanBlock, 'reason' | 'minutes'> {
  why: (exercises: number) => string;
}

function block(lesson: LessonId, start: BlockStart, level: number | null, exercises: number, why: string | ((exercises: number) => string)): Draft {
  return { lesson, start, level, exercises, why: typeof why === 'string' ? () => why : why };
}

/** Scales or chords: the due items, or a few runs of the item the lesson is set to. */
function repertoireBlock(lesson: 'scales' | 'chords', progress: ProgressState, now: number, exercises: number): Draft {
  const mine = lesson === 'scales' ? isScaleItem : isChordItem;
  const due = dueItems(progress.repertoire, now).filter(mine);
  const tried = Object.keys(progress.repertoire).some(mine);
  if (!due.length) {
    if (!tried) return block(lesson, 'plain', null, exercises, 'Not tried yet. Starts with the item it is set to.');
    return block(lesson, 'plain', null, exercises, (n) => `Nothing is due. ${n} run${n === 1 ? '' : 's'} of the item you are on.`);
  }
  const count = Math.min(exercises, due.length);
  let first = '';
  if (lesson === 'scales') {
    const item = parseItemId(due[0]);
    if (item) first = ` Starts with ${itemTitle(item.type, item.tonic)}.`;
  }
  const reason = due.length > count ? `${count} of ${due.length} due items, most overdue first.${first}` : `${count} due item${count === 1 ? '' : 's'}.${first}`;
  return block(lesson, 'review', null, count, reason);
}

function sightBlock(progress: ProgressState, settings: Settings, exercises: number): Draft {
  const level = planLevel(progress, settings, 'sight');
  const weak = findWeakSpots(progress).notes.slice(0, 2);
  if (!weak.length) return block('sight', 'plain', level, exercises, `Level ${level}. New passages at the level you last passed.`);
  return block('sight', 'weak-spots', level, exercises, `Level ${level}. Featuring ${list(weak.map((n) => midiLabel(n.midi)))}, your weakest note${weak.length === 1 ? '' : 's'}.`);
}

function rhythmBlock(progress: ProgressState, settings: Settings, exercises: number): Draft {
  const level = planLevel(progress, settings, 'rhythm');
  if (lastPlayedAt(progress, 'rhythm') === null && !progress.stats.rhythmFigure) return block('rhythm', 'plain', level, exercises, `Not tried yet. Starts at level ${level}.`);
  const weak = findWeakFigures(progress).slice(0, 1);
  if (!weak.length) return block('rhythm', 'plain', level, exercises, `Level ${level}. New rhythms at the level you last passed.`);
  return block('rhythm', 'weak-spots', level, exercises, `Level ${level}. Featuring ${figureName(weak[0].key).toLowerCase()}, your weakest figure.`);
}

function earBlock(progress: ProgressState, settings: Settings, exercises: number): Draft {
  const level = planLevel(progress, settings, 'ear');
  if (lastPlayedAt(progress, 'ear') === null && !progress.stats.interval) return block('ear', 'plain', level, exercises, `Not tried yet. Starts at level ${level}.`);
  if (!findWeakIntervals(progress).length) return block('ear', 'plain', level, exercises, `Level ${level}. New phrases at the level you last passed.`);
  return block('ear', 'weak-spots', level, exercises, `Level ${level}. Featuring the intervals you miss most.`);
}

/**
 * Which of ear training and rhythm goes first: one never tried, then the one with weak spots,
 * then the one that has waited longest.
 */
function need(progress: ProgressState, lesson: 'ear' | 'rhythm', now: number): number {
  const last = lastPlayedAt(progress, lesson);
  const stats = lesson === 'ear' ? progress.stats.interval : progress.stats.rhythmFigure;
  if (last === null && !stats) return 100;
  const weak = lesson === 'ear' ? findWeakIntervals(progress).length : findWeakFigures(progress).length;
  // Without a run in the history (it holds the last 200), the lesson has waited a while.
  const days = last === null ? 14 : Math.min(14, (now - last) / DAY_MS);
  return (weak ? 3 : 0) + days;
}

function total(blocks: readonly Draft[]): number {
  return blocks.reduce((sum, b) => sum + b.exercises * MINUTES_EACH[b.lesson], 0);
}

/** Today's blocks, in order. Empty when every lesson is switched off. */
export function buildPlan(progress: ProgressState, settings: Settings, prefs: PlanPrefs, now: number): PlanBlock[] {
  const shape = SHAPE[prefs.minutes];
  const on = prefs.lessons;
  const blocks: Draft[] = [];

  // 1. Warm-up: the fixed repertoire. Scales first; chords take the slot when scales are off.
  const warmup = on.scales ? 'scales' : on.chords ? 'chords' : null;
  if (warmup) blocks.push(repertoireBlock(warmup, progress, now, shape.warmup));
  // 2. Reading.
  if (on.sight) blocks.push(sightBlock(progress, settings, shape.reading));
  // 3 and 4. Ear training and rhythm: the one that needs it more first; a short plan has room for one.
  const pair = (['ear', 'rhythm'] as const).filter((l) => on[l]).sort((a, b) => need(progress, b, now) - need(progress, a, now));
  const counts = pair.length === 2 ? [shape.third, shape.fourth] : [shape.third];
  pair.forEach((lesson, i) => {
    if (!counts[i]) return;
    blocks.push(lesson === 'ear' ? earBlock(progress, settings, counts[i]) : rhythmBlock(progress, settings, counts[i]));
  });
  // 5. Chords, in a long plan.
  if (on.chords && warmup !== 'chords' && shape.chords) blocks.push(repertoireBlock('chords', progress, now, shape.chords));

  // Lessons switched off (or fewer due items than the slot holds) leave time: the blocks that
  // can take more share it, reading first. A review block is as long as its due items.
  const open = blocks.filter((b) => b.start !== 'review').sort((a, b) => Number(b.lesson === 'sight') - Number(a.lesson === 'sight'));
  for (let added = true; added; ) {
    added = false;
    for (const b of open) {
      if (b.exercises >= MAX_BLOCK_EXERCISES || total(blocks) + MINUTES_EACH[b.lesson] > prefs.minutes + 0.5) continue;
      b.exercises++;
      added = true;
    }
  }
  return blocks.map(({ why, ...b }) => ({ ...b, minutes: minutesFor(b.lesson, b.exercises), reason: why(b.exercises) }));
}

/** What a block lays over the lesson's own settings while it is played. */
export function blockPatch(b: PlanBlock): SettingsPatch {
  switch (b.lesson) {
    case 'sight':
    case 'ear':
    case 'rhythm':
      return { lesson: b.lesson, weakSpotFocus: b.start === 'weak-spots', [b.lesson]: b.level === null ? {} : { level: b.level } };
    case 'scales':
    case 'chords':
      return { lesson: b.lesson, [b.lesson]: { source: b.start === 'review' ? 'review' : 'pick' } };
  }
}

/** A saved plan's preferences, or the defaults for anything missing or wrong. */
export function normalizePlanPrefs(raw: unknown): PlanPrefs {
  const d = DEFAULT_PLAN_PREFS;
  if (!raw || typeof raw !== 'object') return structuredClone(d);
  const r = raw as { minutes?: unknown; lessons?: unknown };
  const lessons = (r.lessons && typeof r.lessons === 'object' ? r.lessons : {}) as Record<string, unknown>;
  return {
    minutes: PLAN_MINUTES.includes(r.minutes as PlanMinutes) ? (r.minutes as PlanMinutes) : d.minutes,
    lessons: Object.fromEntries(LESSON_IDS.map((id) => [id, typeof lessons[id] === 'boolean' ? (lessons[id] as boolean) : d.lessons[id]])) as Record<LessonId, boolean>,
  };
}
