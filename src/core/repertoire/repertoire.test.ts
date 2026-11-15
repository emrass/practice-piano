import { describe, expect, it } from 'vitest';
import { dayKey } from '../progress/days';
import { applyRepertoireRun, dueItems, type LadderRun, logLadder, MAX_LADDER_LOG, normalizeRepertoire, REVIEW_DAYS, setLadder } from './repertoire';

const run = (clean: boolean, tempo = 240, notesPerBeat = 2): LadderRun => ({ itemId: 'major/C/rh', tempo, notesPerBeat, goalTempo: 240, clean });

describe('repertoire ladder and review', () => {
  it('moves up after clean runs, down after messy ones, and masters at the goal tempo', () => {
    const now = Date.UTC(2026, 0, 1);
    let r = applyRepertoireRun(undefined, { mode: 'flow', accuracy: 1, ladder: run(true, 200) }, now);
    expect(r.change.toTempo).toBe(208); // +4 bpm in eighths
    expect(r.item.box).toBe(1);
    expect(r.change.dueInDays).toBe(REVIEW_DAYS[1]);
    r = applyRepertoireRun(r.item, { mode: 'flow', accuracy: 0.7, ladder: run(false, 208) }, now);
    expect(r.item.ladderTempo).toBe(200);
    expect(r.item.box).toBe(0);
    r = applyRepertoireRun(r.item, { mode: 'flow', accuracy: 1, ladder: run(true, 240) }, now);
    expect(r.change.newlyMastered).toBe(true);
    // Learning runs don't move the ladder.
    const w = applyRepertoireRun(r.item, { mode: 'wait', accuracy: 1, ladder: run(false, 240) }, now);
    expect(w.item.ladderTempo).toBe(r.item.ladderTempo);
  });

  it('steps by 4 bpm in the unit of the lesson', () => {
    const r = applyRepertoireRun(undefined, { mode: 'flow', accuracy: 1, ladder: { ...run(true, 60, 1), goalTempo: 80 } }, 0);
    expect(r.change).toMatchObject({ fromTempo: 60, toTempo: 64 });
  });

  it('lists due items, most overdue first', () => {
    const base = { attempts: 1, cleanRuns: 0, ladderTempo: 120, bestCleanTempo: 0, box: 0, lastAt: 0, accuracy: 0.8, mastered: false };
    const items = { a: { ...base, dueAt: 50 }, b: { ...base, dueAt: 10 }, c: { ...base, dueAt: 500 } };
    expect(dueItems(items, 100)).toEqual(['b', 'a']);
  });

  it('clamps hand-set tempos and drops stored items it cannot read', () => {
    expect(setLadder(undefined, 5, 0).ladderTempo).toBe(30);
    const ok = setLadder(undefined, 100, 0);
    expect(normalizeRepertoire({ ok, old: { ladderNpm: 100, dueAt: 0 }, bad: 'x' })).toEqual({ ok });
    expect(normalizeRepertoire(null)).toEqual({});
  });
});

describe('ladder log', () => {
  const day1 = new Date(2026, 10, 10, 12).getTime();
  const day2 = new Date(2026, 10, 11, 9).getTime();
  const k1 = dayKey(new Date(day1));
  const k2 = dayKey(new Date(day2));

  it('keeps the starting tempo, then the latest tempo of each day', () => {
    let r = applyRepertoireRun(undefined, { mode: 'flow', accuracy: 1, ladder: run(true, 200) }, day1);
    expect(r.item.ladderLog).toEqual([
      [k1, 200],
      [k1, 208],
    ]);
    r = applyRepertoireRun(r.item, { mode: 'flow', accuracy: 1, ladder: run(true, 208) }, day1);
    expect(r.item.ladderLog).toEqual([
      [k1, 200],
      [k1, 216],
    ]);
    // A Wait run does not move the ladder: no entry.
    r = applyRepertoireRun(r.item, { mode: 'wait', accuracy: 1, ladder: run(false, 216) }, day2);
    expect(r.item.ladderLog).toHaveLength(2);
    r = applyRepertoireRun(r.item, { mode: 'flow', accuracy: 0.5, ladder: run(false, 216) }, day2);
    expect(r.item.ladderLog?.at(-1)).toEqual([k2, 208]);
  });

  it('logs hand-set tempos and keeps at most MAX_LADDER_LOG entries', () => {
    const set = setLadder(undefined, 100, day1);
    expect(set.ladderLog).toEqual([[k1, 100]]);
    expect(setLadder(set, 120, day2).ladderLog).toEqual([
      [k1, 100],
      [k2, 120],
    ]);
    let log = logLadder(undefined, '2026-01-01', 30);
    for (let i = 1; i <= 100; i++) log = logLadder(log, dayKey(new Date(2026, 0, 1 + i)), 30 + i);
    expect(log).toHaveLength(MAX_LADDER_LOG);
    expect(log.at(-1)?.[1]).toBe(130);
  });

  it('starts the log of items saved before it existed, and drops broken entries', () => {
    const old = { attempts: 3, cleanRuns: 1, ladderTempo: 96, bestCleanTempo: 92, box: 1, dueAt: day2, lastAt: day1, accuracy: 0.9, mastered: false };
    expect(normalizeRepertoire({ a: old }).a.ladderLog).toEqual([[k1, 96]]);
    const broken = { ...old, ladderLog: [['x', 1], [k1, 'fast'], [k2, 100]] };
    expect(normalizeRepertoire({ a: broken }).a.ladderLog).toEqual([[k2, 100]]);
  });
});
