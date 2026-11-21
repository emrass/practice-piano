import { describe, expect, it } from 'vitest';
import { advance, blockOutcome, blockState, dayTotals, isBlockDone, isFinished, isStarted, newDay, normalizePlanDay, planMinutes, recordRun, restoreBlock, skipBlock } from './day';
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

describe('a skipped block', () => {
  const three: PlanBlock[] = [...blocks, { lesson: 'ear', start: 'plain', level: 13, exercises: 1, minutes: 2, reason: 'Level 13.' }];

  it('comes back as the next block when nothing before it is still to play', () => {
    let day = skipBlock(newDay('2026-11-21', 10, three));
    expect(day.at).toBe(1);
    day = restoreBlock(day, 0);
    expect(day.at).toBe(0);
    expect(blockState(day, 0)).toBe('current');
    expect(day.runs[0].skipped).toBe(false);
    expect(planMinutes(day).planned).toBe(9);
  });

  it('keeps its place in the order, and the runs it already has', () => {
    // Block 1 played, block 2 skipped after one run, block 3 under way.
    let day = recordRun(recordRun(newDay('2026-11-21', 10, three), run, pass), run, pass);
    day = skipBlock(recordRun(advance(day), run, pass));
    expect(day.at).toBe(2);
    expect(blockState(day, 1)).toBe('done');
    day = restoreBlock(day, 1);
    // Back before block 3, one run short.
    expect(day.at).toBe(1);
    expect(day.runs[1]).toMatchObject({ done: 1, skipped: false });
    expect(blockState(day, 2)).toBe('next');
    // Played out, the plan goes on to block 3.
    day = advance(recordRun(day, run, pass));
    expect(day.at).toBe(2);
  });

  it('brought back after the end puts the plan under way again', () => {
    let day = skipBlock(skipBlock(skipBlock(newDay('2026-11-21', 10, three))));
    expect(isFinished(day)).toBe(true);
    day = restoreBlock(day, 1);
    expect(isFinished(day)).toBe(false);
    expect(day.at).toBe(1);
    expect(blockState(day, 0)).toBe('skipped');
    // Played, the plan is finished again: the other two stay skipped.
    day = advance(recordRun(recordRun(day, run, pass), run, pass));
    expect(isFinished(day)).toBe(true);
  });

  it('leaves a block alone that was not skipped', () => {
    const day = newDay('2026-11-21', 10, three);
    expect(restoreBlock(day, 1)).toBe(day);
    expect(restoreBlock(day, 9)).toBe(day);
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
