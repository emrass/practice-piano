import { describe, expect, it } from 'vitest';
import { emptyProgress } from './progress';
import { lessonTrend } from './trends';
import type { ProgressState } from './types';

function withDays(days: ProgressState['days']): ProgressState {
  return { ...emptyProgress(), days };
}

const ld = (runs: number, pitchSum: number, extra: Partial<{ timingRuns: number; timingSum: number; levelSum: number }> = {}) => ({
  runs,
  pitchSum,
  timingRuns: 0,
  timingSum: 0,
  levelSum: 0,
  ...extra,
});

describe('lessonTrend', () => {
  it('averages each practice day of the lesson, oldest first, skipping other days', () => {
    const p = withDays({
      '2026-11-03': { exercises: 2, xp: 0, practiceMs: 0, lessons: { sight: ld(2, 1.6, { levelSum: 20, timingRuns: 1, timingSum: 0.7 }) } },
      '2026-11-01': { exercises: 1, xp: 0, practiceMs: 0, lessons: { sight: ld(1, 0.5, { levelSum: 8 }) } },
      '2026-11-02': { exercises: 1, xp: 0, practiceMs: 0, lessons: { ear: ld(1, 1) } },
      '2026-10-30': { exercises: 1, xp: 0, practiceMs: 0 },
    });
    expect(lessonTrend(p, 'sight')).toEqual([
      { day: '2026-11-01', runs: 1, pitch: 0.5, timing: null, level: 8 },
      { day: '2026-11-03', runs: 2, pitch: 0.8, timing: 0.7, level: 10 },
    ]);
    expect(lessonTrend(p, 'sight', 1).map((t) => t.day)).toEqual(['2026-11-03']);
  });

  it('has no level for repertoire lessons', () => {
    const p = withDays({ '2026-11-01': { exercises: 1, xp: 0, practiceMs: 0, lessons: { scales: ld(1, 1) } } });
    expect(lessonTrend(p, 'scales')[0].level).toBeNull();
  });
});
