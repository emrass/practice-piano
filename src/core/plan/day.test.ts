import { describe, expect, it } from 'vitest';
import { advance, blockOutcome, dayTotals, isBlockDone, isFinished, isStarted, newDay, normalizePlanDay, planMinutes, recordRun, skipBlock } from './day';
import type { PlanBlock } from './planner';

const blocks: PlanBlock[] = [
  { lesson: 'scales', start: 'review', level: null, exercises: 2, minutes: 3, reason: '2 due items.' },
  { lesson: 'sight', start: 'plain', level: 45, exercises: 2, minutes: 4, reason: 'Level 45.' },
];
const pass = { xp: 20, passed: true, newlyMastered: false };
const miss = { xp: 5, passed: false, newlyMastered: false };
const run = { durationMs: 30_000 };

describe('today’s plan', () => {
  it('counts every finished run of the block under way', () => {
    let day = newDay('2026-11-21', 10, blocks);
    expect(isStarted(day)).toBe(false);
    day = recordRun(day, run, pass);
    expect(isStarted(day)).toBe(true);
    expect(isBlockDone(day)).toBe(false);
    day = recordRun(day, run, { ...pass, repertoire: { itemId: 'major/G/rh', fromTempo: 120, toTempo: 128, clean: true, newlyMastered: false, mastered: false, dueInDays: 1 } });
    expect(isBlockDone(day)).toBe(true);
    expect(day.runs[0]).toMatchObject({ done: 2, passed: 2, xp: 40, playedMs: 60_000, tempoUps: 1 });
    expect(blockOutcome(blocks[0], day.runs[0])).toBe('2 of 2 passed. One tempo went up.');
    // The block is done, but the plan moves on only when the player does.
    expect(day.at).toBe(0);
    day = advance(day);
    day = recordRun(recordRun(day, run, miss), run, { ...pass, newlyMastered: true });
    expect(blockOutcome(blocks[1], day.runs[1])).toBe('1 of 2 passed. Tier mastered.');
    day = advance(day);
    expect(isFinished(day)).toBe(true);
    expect(dayTotals(day)).toEqual({ exercises: 4, passed: 3, xp: 65, playedMs: 120_000 });
    expect(planMinutes(day)).toEqual({ done: 7, planned: 7 });
    // Runs after the end are free practice.
    expect(recordRun(day, run, pass)).toBe(day);
  });

  it('shows minutes by the blocks’ estimates', () => {
    const day = recordRun(newDay('2026-11-21', 10, blocks), run, pass);
    expect(planMinutes(day)).toEqual({ done: 2, planned: 7 });
  });

  it('a skipped block leaves the plan', () => {
    let day = skipBlock(newDay('2026-11-21', 10, blocks));
    expect(day.at).toBe(1);
    expect(blockOutcome(blocks[0], day.runs[0])).toBe('Skipped.');
    expect(planMinutes(day)).toEqual({ done: 0, planned: 4 });
    day = skipBlock(recordRun(day, run, pass));
    expect(isFinished(day)).toBe(true);
    expect(blockOutcome(blocks[1], day.runs[1])).toBe('1 of 1 passed. Rest skipped.');
    expect(planMinutes(day)).toEqual({ done: 2, planned: 2 });
  });
});

describe('normalizePlanDay', () => {
  const saved = JSON.parse(JSON.stringify(recordRun(newDay('2026-11-21', 10, blocks), run, pass)));

  it('keeps today’s plan as it was saved', () => {
    expect(normalizePlanDay(saved, '2026-11-21')).toEqual(saved);
  });

  it('drops yesterday’s plan and damaged entries', () => {
    expect(normalizePlanDay(saved, '2026-11-22')).toBeNull();
    expect(normalizePlanDay(null, '2026-11-21')).toBeNull();
    expect(normalizePlanDay({ ...saved, runs: [] }, '2026-11-21')).toBeNull();
    expect(normalizePlanDay({ ...saved, at: 9 }, '2026-11-21')).toBeNull();
    expect(normalizePlanDay({ ...saved, blocks: [{ ...blocks[0], lesson: 'harp' }, blocks[1]] }, '2026-11-21')).toBeNull();
  });
});
