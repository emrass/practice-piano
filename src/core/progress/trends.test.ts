import { describe, expect, it } from 'vitest';
import { dayKey } from './days';
import { emptyProgress } from './progress';
import { calendarWeeks, lessonTrend } from './trends';
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

describe('calendarWeeks', () => {
  it('ends with the week of today, Monday first, and marks future days', () => {
    const today = new Date(2026, 10, 12, 15); // a Thursday
    const weeks = calendarWeeks(emptyProgress(), today);
    expect(weeks).toHaveLength(17);
    const last = weeks.at(-1)!.days;
    expect(last[0].day).toBe('2026-11-09');
    expect(last[3]).toMatchObject({ day: dayKey(today), future: false });
    expect(last[4].future).toBe(true);
    expect(weeks[0].days[0].day).toBe('2026-07-20');
  });

  it('keeps every day exactly once across DST changes and month starts', () => {
    const weeks = calendarWeeks(emptyProgress(), new Date(2026, 10, 12, 15), 17);
    const days = weeks.flatMap((w) => w.days.map((d) => d.day));
    expect(new Set(days).size).toBe(days.length);
    expect(days).toContain('2026-10-25'); // the EU DST change
    expect(days).toContain('2026-11-01'); // the US DST change
    expect(weeks.filter((w) => w.month).map((w) => w.month)).toEqual(['Aug', 'Sep', 'Oct', 'Nov']);
  });

  it('shades by minutes and lists the lessons of each day', () => {
    const p = withDays({
      '2026-11-10': { exercises: 3, xp: 0, practiceMs: 25 * 60000, lessons: { sight: ld(2, 2), scales: ld(1, 1) } },
      '2026-11-11': { exercises: 1, xp: 0, practiceMs: 20000 },
    });
    const days = calendarWeeks(p, new Date(2026, 10, 12, 15)).at(-1)!.days;
    expect(days[1]).toMatchObject({ minutes: 25, exercises: 3, intensity: 3, lessons: ['sight', 'scales'] });
    expect(days[2]).toMatchObject({ minutes: 0, intensity: 1, lessons: [] });
    expect(days[0].intensity).toBe(0);
  });
});
