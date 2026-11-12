import { describe, expect, it } from 'vitest';
import type { ExerciseResult, NoteResult } from '../eval/types';
import {
  applyResult,
  computeAward,
  dayKey,
  displayStreak,
  emptyProgress,
  findWeakSpots,
  noteHeatmap,
  normalizeProgress,
  updateStreak,
  xpLevelCeiling,
  type ProgressState,
} from './progress';

function result(over: Partial<ExerciseResult> = {}, notes?: NoteResult[]): ExerciseResult {
  const n = notes ?? Array.from({ length: 20 }, (_, i) => ({ midi: 60 + (i % 5), hand: 'rh' as const, clef: 'treble' as const, correct: true, reactionMs: 500 }));
  return {
    mode: 'wait',
    exerciseId: 'ex-1',
    level: 2,
    tierId: 't01',
    totalNotes: n.length,
    correctNotes: n.filter((x) => x.correct).length,
    wrongNotes: 0,
    missedNotes: 0,
    pitchAccuracy: 1,
    timingAccuracy: null,
    medianReactionMs: 500,
    meanAbsTimingMs: null,
    cleanSteps: n.length,
    totalSteps: n.length,
    durationMs: 30000,
    notes: n,
    completedAt: 0,
    ...over,
  };
}

const day1 = new Date(2026, 10, 10, 12);
const day2 = new Date(2026, 10, 11, 9);
const day4 = new Date(2026, 10, 13, 9);

describe('streaks', () => {
  it('extends on consecutive days and resets after a gap', () => {
    let s = updateStreak({ current: 0, best: 0, lastDay: null }, dayKey(day1));
    expect(s.current).toBe(1);
    s = updateStreak(s, dayKey(day1));
    expect(s.current).toBe(1);
    s = updateStreak(s, dayKey(day2));
    expect(s.current).toBe(2);
    expect(displayStreak(s, dayKey(day2))).toBe(2);
    expect(displayStreak(s, dayKey(day4))).toBe(0);
    s = updateStreak(s, dayKey(day4));
    expect(s).toEqual({ current: 1, best: 2, lastDay: dayKey(day4) });
  });

  it('handles month boundaries', () => {
    const s = updateStreak({ current: 3, best: 3, lastDay: '2026-10-31' }, '2026-11-01');
    expect(s.current).toBe(4);
  });
});

describe('XP & mastery', () => {
  it('rewards accuracy steeply and gives nothing at chance level', () => {
    const p = emptyProgress();
    const perfect = computeAward(p, result({ pitchAccuracy: 1 }));
    const ninety = computeAward(p, result({ pitchAccuracy: 0.9 }));
    const sloppy = computeAward(p, result({ pitchAccuracy: 0.5 }));
    expect(perfect.xp).toBeGreaterThan(ninety.xp);
    expect(sloppy.xp).toBe(0);
    expect(sloppy.passed).toBe(false);
  });

  it('gives a first-sight bonus only for a successful first attempt', () => {
    let p = emptyProgress();
    const first = applyResult(p, result(), day1);
    expect(first.award.firstAttempt).toBe(true);
    expect(first.award.firstSightBonus).toBeGreaterThan(0);
    p = first.progress;
    const again = applyResult(p, result(), day1);
    expect(again.award.firstAttempt).toBe(false);
    expect(again.award.firstSightBonus).toBe(0);
    expect(again.award.xp).toBeLessThan(first.award.xp);
    const failedFirst = computeAward(emptyProgress(), result({ exerciseId: 'other', pitchAccuracy: 0.8 }));
    expect(failedFirst.firstSightBonus).toBe(0);
  });

  it('masters a tier only after enough distinct passages at >= 90 %', () => {
    let p: ProgressState = emptyProgress();
    // Repeating the same passage does not count twice.
    for (let i = 0; i < 5; i++) p = applyResult(p, result({ exerciseId: 'same' }), day1).progress;
    expect(p.tiers.t01.passes).toBe(1);
    expect(p.tiers.t01.mastered).toBe(false);
    p = applyResult(p, result({ exerciseId: 'b', pitchAccuracy: 0.85 }), day1).progress;
    expect(p.tiers.t01.passes).toBe(1);
    p = applyResult(p, result({ exerciseId: 'c' }), day1).progress;
    const last = applyResult(p, result({ exerciseId: 'd' }), day1);
    expect(last.award.newlyMastered).toBe(true);
    expect(last.progress.tiers.t01.mastered).toBe(true);
  });

  it('caps the XP level multiplier until tiers are mastered (no reward for just cranking difficulty)', () => {
    const p = emptyProgress();
    expect(xpLevelCeiling(p)).toBe(6); // top of tier 2
    const low = computeAward(p, result({ level: 5 }));
    const high = computeAward(p, result({ level: 95, exerciseId: 'hard' }));
    expect(high.levelCapped).toBe(true);
    expect(high.baseXp).toBe(low.baseXp);
    const mastered: ProgressState = {
      ...p,
      tiers: { t12: { attempts: 6, passes: 6, passedExercises: [], bestAccuracy: 1, mastered: true } },
    };
    expect(computeAward(mastered, result({ level: 95 })).levelCapped).toBe(false);
  });

  it('scales Flow mode XP with timing accuracy', () => {
    const p = emptyProgress();
    const tight = computeAward(p, result({ mode: 'flow', timingAccuracy: 1 }));
    const loose = computeAward(p, result({ mode: 'flow', timingAccuracy: 0.3 }));
    expect(tight.xp).toBeGreaterThan(loose.xp);
  });
});

describe('weak spots & heatmap', () => {
  it('finds consistently missed notes per clef', () => {
    let p = emptyProgress();
    for (let i = 0; i < 6; i++) {
      const notes: NoteResult[] = [
        { midi: 60, hand: 'rh', clef: 'treble', correct: true, reactionMs: 400 },
        { midi: 65, hand: 'rh', clef: 'treble', correct: i % 3 === 0, reactionMs: 1500 },
        { midi: 48, hand: 'lh', clef: 'bass', correct: i % 2 === 0, reactionMs: 900 },
      ];
      p = applyResult(p, result({ exerciseId: `w${i}`, pitchAccuracy: 0.7 }, notes), day1).progress;
    }
    const weak = findWeakSpots(p);
    expect(weak.notes[0]).toMatchObject({ midi: 65, clef: 'treble' });
    expect(weak.notes.some((n) => n.midi === 48 && n.clef === 'bass')).toBe(true);
    expect(weak.notes.some((n) => n.midi === 60)).toBe(false);
    const heat = noteHeatmap(p);
    expect(heat.get(60)?.accuracy).toBe(1);
    expect(heat.get(65)?.accuracy).toBeCloseTo(2 / 6);
  });

  it('stores stats in an extensible dimension → key map', () => {
    const p = applyResult(emptyProgress(), result(), day1).progress;
    expect(Object.keys(p.stats).sort()).toEqual(['clef', 'note']);
    expect(p.stats.note['treble:60'].attempts).toBe(4);
    expect(p.stats.clef.treble.attempts).toBe(20);
  });
});

describe('normalizeProgress', () => {
  it('repairs missing or malformed fields', () => {
    expect(normalizeProgress(null)).toEqual(emptyProgress());
    const p = normalizeProgress({ xp: 'lots', streak: { current: 4 }, history: 'nope', tiers: [] });
    expect(p.xp).toBe(0);
    expect(p.streak.current).toBe(4);
    expect(p.history).toEqual([]);
    expect(p.tiers).toEqual({});
  });
});
