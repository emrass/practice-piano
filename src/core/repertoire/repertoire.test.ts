import { describe, expect, it } from 'vitest';
import { applyRepertoireRun, dueItems, type LadderRun, normalizeRepertoire, REVIEW_DAYS, setLadder } from './repertoire';

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
