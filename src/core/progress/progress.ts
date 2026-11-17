import type { ExerciseResult } from '../eval/types';
import { median } from '../eval/types';
import { tierForLevel } from '../generator/tiers';
import { findTier, LESSONS, type LessonId } from '../lessons';
import { applyRepertoireRun, normalizeRepertoire, type RepertoireChange } from '../repertoire/repertoire';
import { chordsRules } from './chords';
import { dayKey, isDayKey, previousDay } from './days';
import { earRules } from './ear';
import { rhythmRules } from './rhythm';
import { scalesRules } from './scales';
import { sightRules } from './sight';
import type { DayLog, HistoryEntry, LessonDay, LessonProgressRules, ProgressState } from './types';

export type { ProgressState } from './types';
export { dayKey } from './days';

export const PROGRESS_SCHEMA_VERSION = 1;
const MAX_HISTORY = 200;
const MAX_ATTEMPT_IDS = 400;
const MAX_DAYS = 120;

/** Every lesson's progress rules, each typed on that lesson's result. */
const PROGRESS_RULES: { [L in LessonId]: LessonProgressRules<Extract<ExerciseResult, { lesson: L }>> } = {
  sight: sightRules,
  ear: earRules,
  rhythm: rhythmRules,
  scales: scalesRules,
  chords: chordsRules,
};

/**
 * The rules for a result's lesson. TypeScript can't tie `result.lesson` to the entry it picks,
 * so the entry is returned as rules for any result (allowed because methods are checked
 * bivariantly). That holds because it is looked up by the result's own lesson: always call it
 * with the same result, as `progressRules(result).isPass(result)`.
 */
function progressRules(result: ExerciseResult): LessonProgressRules {
  return PROGRESS_RULES[result.lesson];
}

export interface Award {
  xp: number;
  baseXp: number;
  firstSightBonus: number;
  firstAttempt: boolean;
  passed: boolean;
  tierId: string;
  tierPasses: number;
  tierRequired: number;
  newlyMastered: boolean;
  streak: number;
  /** Repertoire lessons: what this run did to the item's ladder and review date. */
  repertoire?: RepertoireChange;
}

export function emptyProgress(): ProgressState {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    xp: 0,
    exercisesCompleted: 0,
    streak: { current: 0, best: 0, lastDay: null },
    days: {},
    tiers: {},
    stats: {},
    attempts: {},
    history: [],
    repertoire: {},
  };
}


export function updateStreak(streak: ProgressState['streak'], today: string): ProgressState['streak'] {
  if (streak.lastDay === today) return streak;
  const current = streak.lastDay === previousDay(today) ? streak.current + 1 : 1;
  return { current, best: Math.max(streak.best, current), lastDay: today };
}

/** Streak as displayed today (a streak is lost once a full day is skipped). */
export function displayStreak(streak: ProgressState['streak'], today: string): number {
  if (!streak.lastDay) return 0;
  if (streak.lastDay === today || streak.lastDay === previousDay(today)) return streak.current;
  return 0;
}

function accuracyFactor(acc: number): number {
  const x = Math.min(1, Math.max(0, (acc - 0.5) / 0.5));
  return x * x;
}

/** Pass by the lesson's rule: mastery accuracy; Rhythm also needs the timing, a repertoire Flow run must be clean. */
export function isPass(result: ExerciseResult): boolean {
  return progressRules(result).isPass(result);
}

/**
 * Repertoire XP: repetition is the point, so no first-sight bonus or repeat penalty; faster
 * clean playing earns more (tempo relative to the lesson's reference tempo).
 */
function repertoireAward(progress: ProgressState, result: ExerciseResult): Award {
  const flow = result.mode === 'flow';
  // A lesson without a tempo ratio counts as the slowest tempo.
  const tempo = Math.min(2, Math.max(0.5, progressRules(result).tempoRatio?.(result) ?? 0.5));
  const xp = Math.round(result.totalNotes * accuracyFactor(result.pitchAccuracy) * (flow ? (0.6 + 0.6 * (result.timingAccuracy ?? 0)) * tempo : 0.5));
  return {
    xp,
    baseXp: xp,
    firstSightBonus: 0,
    firstAttempt: (progress.attempts[result.exerciseId] ?? 0) === 0,
    passed: isPass(result),
    tierId: result.tierId,
    tierPasses: 0,
    tierRequired: 0,
    newlyMastered: false,
    streak: progress.streak.current,
  };
}

export function computeAward(progress: ProgressState, result: ExerciseResult): Award {
  const { lesson } = result;
  if (LESSONS[lesson].repertoire) return repertoireAward(progress, result);
  const tier = findTier(result.tierId) ?? LESSONS[lesson].tierForLevel(result.level) ?? tierForLevel(result.level);
  const tierState = progress.tiers[tier.id];
  const firstAttempt = (progress.attempts[result.exerciseId] ?? 0) === 0;
  // Harder material pays more per note; the accuracy factor decides how much of it is earned.
  // No cap: learners choose their level freely (DIDACTICS principle 4).
  const levelMult = 1 + result.level / 50;
  // Flow: timing matters. Ear: every extra listen costs a little (the first one is free).
  const replays = progressRules(result).replays?.(result) ?? 0;
  const modeMult = result.mode === 'flow' ? 0.6 + 0.6 * (result.timingAccuracy ?? 0) : 1 / (1 + 0.2 * replays);
  const baseXp = Math.round(result.totalNotes * levelMult * accuracyFactor(result.pitchAccuracy) * modeMult);
  const passed = isPass(result);
  const firstSightBonus = firstAttempt && passed ? Math.round(baseXp * 0.5) + 5 : 0;
  const xp = Math.round(baseXp * (firstAttempt ? 1 : 0.4)) + firstSightBonus;
  const already = tierState?.passedExercises.includes(result.exerciseId) ?? false;
  const tierPasses = (tierState?.passes ?? 0) + (passed && !already ? 1 : 0);
  const newlyMastered = !tierState?.mastered && tierPasses >= tier.passesRequired;
  return {
    xp,
    baseXp,
    firstSightBonus,
    firstAttempt,
    passed,
    tierId: tier.id,
    tierPasses,
    tierRequired: tier.passesRequired,
    newlyMastered,
    streak: progress.streak.current,
  };
}

function trimRecord<T>(record: Record<string, T>, max: number): Record<string, T> {
  const keys = Object.keys(record);
  if (keys.length <= max) return record;
  const keep = keys.sort().slice(keys.length - max);
  return Object.fromEntries(keep.map((k) => [k, record[k]]));
}

/** Pure: returns a new progress object plus what was earned. */
export function applyResult(progress: ProgressState, result: ExerciseResult, now: Date): { progress: ProgressState; award: Award } {
  const rules = progressRules(result);
  const next: ProgressState = structuredClone(progress);
  const today = dayKey(now);
  next.streak = updateStreak(next.streak, today);
  const award = { ...computeAward(progress, result), streak: next.streak.current };

  next.xp += award.xp;
  next.exercisesCompleted++;
  next.attempts[result.exerciseId] = (next.attempts[result.exerciseId] ?? 0) + 1;
  next.attempts = trimRecord(next.attempts, MAX_ATTEMPT_IDS);

  const day = (next.days[today] ??= { exercises: 0, xp: 0, practiceMs: 0 });
  day.exercises++;
  day.xp += award.xp;
  day.practiceMs += Math.min(result.durationMs, 30 * 60 * 1000);
  addToLessonDay(((day.lessons ??= {})[result.lesson] ??= emptyLessonDay()), result);
  next.days = trimRecord(next.days, MAX_DAYS);

  if (LESSONS[result.lesson].repertoire) recordRepertoireRun(next, award, result, now);
  else recordTierRun(next, award, result, now);

  rules.recordObservations(next.stats, result);

  next.history.push({
    at: now.getTime(),
    lesson: result.lesson,
    replays: rules.replays?.(result),
    exerciseId: result.exerciseId,
    mode: result.mode,
    level: result.level,
    tierId: award.tierId,
    pitchAccuracy: result.pitchAccuracy,
    timingAccuracy: result.timingAccuracy,
    medianReactionMs: result.medianReactionMs,
    xp: award.xp,
    firstSight: award.firstSightBonus > 0,
    passed: award.passed,
  });
  if (next.history.length > MAX_HISTORY) next.history.splice(0, next.history.length - MAX_HISTORY);
  return { progress: next, award };
}

function emptyLessonDay(): LessonDay {
  return { runs: 0, pitchSum: 0, timingRuns: 0, timingSum: 0, levelSum: 0 };
}

/** Adds one run (a result, or a history entry when backfilling) to its lesson's day. */
function addToLessonDay(
  ld: LessonDay,
  run: { lesson: LessonId; pitchAccuracy: number; timingAccuracy: number | null; level: number },
): void {
  ld.runs++;
  ld.pitchSum += run.pitchAccuracy;
  if (run.timingAccuracy !== null) {
    ld.timingRuns++;
    ld.timingSum += run.timingAccuracy;
  }
  if (!LESSONS[run.lesson].repertoire) ld.levelSum += run.level;
}

function recordTierRun(next: ProgressState, award: Award, result: ExerciseResult, now: Date): void {
  const tier = (next.tiers[award.tierId] ??= { attempts: 0, passes: 0, passedExercises: [], bestAccuracy: 0, mastered: false });
  tier.attempts++;
  tier.bestAccuracy = Math.max(tier.bestAccuracy, result.pitchAccuracy);
  if (award.passed && !tier.passedExercises.includes(result.exerciseId)) {
    tier.passes++;
    tier.passedExercises.push(result.exerciseId);
    if (tier.passedExercises.length > 50) tier.passedExercises.shift();
  }
  if (award.newlyMastered) {
    tier.mastered = true;
    tier.masteredAt = now.getTime();
  }
}

/** Repertoire lessons: tempo ladder, mastery and review date of the item. */
function recordRepertoireRun(next: ProgressState, award: Award, result: ExerciseResult, now: Date): void {
  const ladder = progressRules(result).ladderRun?.(result);
  if (!ladder) return;
  const id = ladder.itemId;
  const { item, change } = applyRepertoireRun(next.repertoire[id], { mode: result.mode, accuracy: result.pitchAccuracy, ladder }, now.getTime());
  next.repertoire[id] = item;
  award.repertoire = change;
  award.newlyMastered = change.newlyMastered;
}

/** Recent aggregate metrics for the dashboard. */
export function recentSummary(progress: ProgressState, count = 20, lesson?: LessonId) {
  const recent = progress.history.filter((h) => !lesson || h.lesson === lesson).slice(-count);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    exercises: recent.length,
    pitchAccuracy: avg(recent.map((h) => h.pitchAccuracy)),
    timingAccuracy: avg(recent.filter((h) => h.timingAccuracy !== null).map((h) => h.timingAccuracy as number)),
    medianReactionMs: median(recent.map((h) => h.medianReactionMs).filter((v): v is number => v !== null)),
    replays: recent.length ? Math.round((recent.reduce((a, h) => a + (h.replays ?? 0), 0) / recent.length) * 10) / 10 : 0,
  };
}

/** Entries recorded before lessons existed have no `lesson`: they are sight reading. */
function migrateHistoryEntry(entry: Omit<HistoryEntry, 'lesson'> & { lesson?: LessonId }): HistoryEntry {
  return { ...entry, lesson: entry.lesson ?? 'sight' };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** A stored lesson breakdown's valid entries, or undefined when there are none. */
function normalizeLessonDays(raw: unknown): DayLog['lessons'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: DayLog['lessons'] = {};
  for (const [lesson, v] of Object.entries(raw as Record<string, Partial<LessonDay>>)) {
    if (!(lesson in LESSONS) || !v || !finite(v.runs) || v.runs <= 0 || !finite(v.pitchSum)) continue;
    out[lesson as LessonId] = {
      runs: v.runs,
      pitchSum: v.pitchSum,
      timingRuns: finite(v.timingRuns) ? v.timingRuns : 0,
      timingSum: finite(v.timingSum) ? v.timingSum : 0,
      levelSum: finite(v.levelSum) ? v.levelSum : 0,
    };
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Valid day logs. Days saved before the per-lesson breakdown existed get it from the history
 * where it still holds their runs (the oldest of those days may be partial).
 */
function normalizeDays(raw: unknown, history: readonly HistoryEntry[]): Record<string, DayLog> {
  const out: Record<string, DayLog> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, v] of Object.entries(raw as Record<string, Partial<DayLog>>)) {
    if (!isDayKey(key) || !v || typeof v !== 'object') continue;
    const day: DayLog = { exercises: finite(v.exercises) ? v.exercises : 0, xp: finite(v.xp) ? v.xp : 0, practiceMs: finite(v.practiceMs) ? v.practiceMs : 0 };
    const lessons = normalizeLessonDays(v.lessons);
    if (lessons) day.lessons = lessons;
    out[key] = day;
  }
  const backfill = new Set(Object.keys(out).filter((k) => !out[k].lessons));
  for (const h of history) {
    const key = dayKey(new Date(h.at));
    if (!backfill.has(key) || !(h.lesson in LESSONS) || !finite(h.pitchAccuracy)) continue;
    addToLessonDay(((out[key].lessons ??= {})[h.lesson] ??= emptyLessonDay()), {
      lesson: h.lesson,
      pitchAccuracy: h.pitchAccuracy,
      timingAccuracy: finite(h.timingAccuracy) ? h.timingAccuracy : null,
      level: finite(h.level) ? h.level : 0,
    });
  }
  return trimRecord(out, MAX_DAYS);
}

/** Defensive normalization for data loaded from storage or an import file. */
export function normalizeProgress(raw: unknown): ProgressState {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<ProgressState>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const obj = <T>(v: unknown, d: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : d);
  const history = Array.isArray(r.history) ? r.history.slice(-MAX_HISTORY).map(migrateHistoryEntry) : [];
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    xp: num(r.xp, 0),
    exercisesCompleted: num(r.exercisesCompleted, 0),
    streak: {
      current: num(r.streak?.current, 0),
      best: num(r.streak?.best, 0),
      lastDay: typeof r.streak?.lastDay === 'string' ? r.streak.lastDay : null,
    },
    days: normalizeDays(r.days, history),
    tiers: obj(r.tiers, base.tiers),
    stats: obj(r.stats, base.stats),
    attempts: obj(r.attempts, base.attempts),
    history,
    repertoire: normalizeRepertoire(r.repertoire),
  };
}
