import { LESSON_IDS, LESSONS } from '../lessons';
import type { Award } from '../progress/progress';
import { PLAN_MINUTES, type PlanBlock, type PlanMinutes } from './planner';

/**
 * Today's plan as it is played: the blocks made in the morning (planner.ts) and what has been
 * done in each. Pure functions; the app saves the state so a plan survives closing the app, and
 * drops it when the day changes.
 */

export interface BlockRun {
  /** Finished runs. Every finished run counts, a repeat of the same exercise too. */
  done: number;
  passed: number;
  xp: number;
  /** Time spent playing (the runs' own length, without the time between them). */
  playedMs: number;
  /** Repertoire: runs that moved an item's tempo ladder up. */
  tempoUps: number;
  /** Tiers or repertoire items mastered in this block. */
  mastered: number;
  skipped: boolean;
}

export interface PlanDay {
  /** Local calendar day, YYYY-MM-DD (progress.ts `dayKey`). */
  day: string;
  minutes: PlanMinutes;
  blocks: PlanBlock[];
  runs: BlockRun[];
  /** The block under way or next to start; `blocks.length` once the plan is finished. */
  at: number;
}

const emptyRun = (): BlockRun => ({ done: 0, passed: 0, xp: 0, playedMs: 0, tempoUps: 0, mastered: 0, skipped: false });

export function newDay(day: string, minutes: PlanMinutes, blocks: PlanBlock[]): PlanDay {
  return { day, minutes, blocks, runs: blocks.map(emptyRun), at: 0 };
}

export function isFinished(day: PlanDay): boolean {
  return day.at >= day.blocks.length;
}

/** Something was played or skipped: the plan no longer follows changes to its preferences. */
export function isStarted(day: PlanDay): boolean {
  return day.at > 0 || day.runs.some((r) => r.done > 0 || r.skipped);
}

/** The block under way has its runs: the next step is the next block. */
export function isBlockDone(day: PlanDay, index = day.at): boolean {
  const block = day.blocks[index];
  return !!block && day.runs[index].done >= block.exercises;
}

/** A finished run of the block under way. Runs after the plan is finished are not the plan's. */
export function recordRun(day: PlanDay, run: { durationMs: number }, award: Pick<Award, 'xp' | 'passed' | 'newlyMastered' | 'repertoire'>): PlanDay {
  if (isFinished(day)) return day;
  const runs = day.runs.map((r, i) =>
    i === day.at
      ? {
          ...r,
          done: r.done + 1,
          passed: r.passed + (award.passed ? 1 : 0),
          xp: r.xp + award.xp,
          playedMs: r.playedMs + Math.max(0, run.durationMs),
          tempoUps: r.tempoUps + (award.repertoire && award.repertoire.toTempo > award.repertoire.fromTempo ? 1 : 0),
          mastered: r.mastered + (award.newlyMastered ? 1 : 0),
        }
      : r,
  );
  return { ...day, runs };
}

export type BlockState = 'done' | 'skipped' | 'current' | 'next';

/** A block that still has runs to play: not skipped, and short of its runs. */
function isOpen(day: PlanDay, index: number): boolean {
  return !day.runs[index].skipped && day.runs[index].done < day.blocks[index].exercises;
}

/** The first block in order that still has runs to play, or `blocks.length` when none has. */
function firstOpen(day: PlanDay): number {
  const index = day.blocks.findIndex((_, i) => isOpen(day, i));
  return index < 0 ? day.blocks.length : index;
}

/** Where a block stands: played, left out, under way (or next to start), or still to come. */
export function blockState(day: PlanDay, index: number): BlockState {
  if (index === day.at) return 'current';
  const run = day.runs[index];
  if (run.skipped) return run.done === 0 ? 'skipped' : 'done';
  return run.done >= day.blocks[index].exercises ? 'done' : 'next';
}

/**
 * On to the next block: the first one in order that still has runs to play (or the end). In
 * order, not simply the one after: a block brought back after a skip comes before later ones.
 */
export function advance(day: PlanDay): PlanDay {
  return isFinished(day) ? day : { ...day, at: firstOpen(day) };
}

/** Leave the block under way out of today's plan. Runs already played in it stay counted. */
export function skipBlock(day: PlanDay): PlanDay {
  if (isFinished(day)) return day;
  const skipped = { ...day, runs: day.runs.map((r, i) => (i === day.at ? { ...r, skipped: true } : r)) };
  return { ...skipped, at: firstOpen(skipped) };
}

/**
 * Bring a skipped block back into today's plan, with the runs it already has. It takes its
 * place in the order again, so it is the next block if nothing before it is still to play.
 * A plan that was finished is under way again.
 */
export function restoreBlock(day: PlanDay, index: number): PlanDay {
  if (!day.runs[index]?.skipped) return day;
  const restored = { ...day, runs: day.runs.map((r, i) => (i === index ? { ...r, skipped: false } : r)) };
  return { ...restored, at: firstOpen(restored) };
}

/** Minutes of the plan that are played, by the blocks' estimates (a skipped block leaves the plan). */
export function planMinutes(day: PlanDay): { done: number; planned: number } {
  let done = 0;
  let planned = 0;
  day.blocks.forEach((b, i) => {
    const r = day.runs[i];
    if (r.skipped && r.done === 0) return;
    const share = r.skipped ? 1 : Math.min(1, r.done / Math.max(1, b.exercises));
    const minutes = r.skipped ? Math.round((b.minutes * Math.min(r.done, b.exercises)) / Math.max(1, b.exercises)) : b.minutes;
    planned += minutes;
    done += minutes * share;
  });
  return { done: Math.round(done), planned };
}

export function dayTotals(day: PlanDay): { exercises: number; passed: number; xp: number; playedMs: number } {
  return day.runs.reduce(
    (t, r) => ({ exercises: t.exercises + r.done, passed: t.passed + r.passed, xp: t.xp + r.xp, playedMs: t.playedMs + r.playedMs }),
    { exercises: 0, passed: 0, xp: 0, playedMs: 0 },
  );
}

/** What a played block came to, for the plan's list: "3 of 3 passed. One tempo went up." */
export function blockOutcome(block: PlanBlock, run: BlockRun): string {
  if (run.done === 0) return run.skipped ? 'Skipped.' : block.reason;
  const parts = [`${run.passed} of ${run.done} passed.`];
  if (run.tempoUps) parts.push(run.tempoUps === 1 ? 'One tempo went up.' : `${run.tempoUps} tempos went up.`);
  if (run.mastered) parts.push(LESSONS[block.lesson].repertoire ? (run.mastered === 1 ? 'One item mastered.' : `${run.mastered} items mastered.`) : 'Tier mastered.');
  if (run.skipped) parts.push('Rest skipped.');
  return parts.join(' ');
}

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null);

function normalizeBlock(raw: unknown): PlanBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lesson = LESSON_IDS.find((id) => id === r.lesson);
  const start = (['review', 'weak-spots', 'plain'] as const).find((s) => s === r.start);
  const exercises = num(r.exercises, 1, 50);
  const minutes = num(r.minutes, 1, 120);
  if (!lesson || !start || exercises === null || minutes === null || typeof r.reason !== 'string') return null;
  const level = r.level === null ? null : num(r.level, 1, 100);
  if (r.level !== null && level === null) return null;
  return { lesson, start, level: level === null ? null : Math.round(level), exercises: Math.round(exercises), minutes: Math.round(minutes), reason: r.reason };
}

function normalizeRun(raw: unknown): BlockRun | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const count = (v: unknown) => num(v, 0, 1e9);
  const [done, passed, xp, playedMs, tempoUps, mastered] = [r.done, r.passed, r.xp, r.playedMs, r.tempoUps, r.mastered].map(count);
  if (done === null || passed === null || xp === null || playedMs === null || tempoUps === null || mastered === null) return null;
  return { done, passed, xp, playedMs, tempoUps, mastered, skipped: r.skipped === true };
}

/**
 * A saved plan, if it is today's and whole. Anything else (yesterday's plan, a damaged entry)
 * is null, and the app makes a new plan.
 */
export function normalizePlanDay(raw: unknown, today: string): PlanDay | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.day !== today || !Array.isArray(r.blocks) || !Array.isArray(r.runs) || r.blocks.length !== r.runs.length) return null;
  const minutes = PLAN_MINUTES.find((m) => m === r.minutes);
  const blocks = r.blocks.map(normalizeBlock);
  const runs = r.runs.map(normalizeRun);
  const at = num(r.at, 0, blocks.length);
  if (!minutes || at === null || blocks.some((b) => !b) || runs.some((x) => !x)) return null;
  return { day: today, minutes, blocks: blocks as PlanBlock[], runs: runs as BlockRun[], at: Math.round(at) };
}
