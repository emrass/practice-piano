import { LESSONS, type LessonId } from '../lessons';
import { addDays, dayDate, dayKey } from './days';
import type { ProgressState } from './types';

/** One practice day of a lesson: the averages of that day's runs. */
export interface TrendPoint {
  day: string;
  runs: number;
  pitch: number;
  /** Null when no run of the day had a timing score (Wait mode). */
  timing: number | null;
  /** Average level; null for repertoire lessons. */
  level: number | null;
}

/** The lesson's last `maxDays` practice days, oldest first (days without it are left out). */
export function lessonTrend(progress: ProgressState, lesson: LessonId, maxDays = 30): TrendPoint[] {
  const leveled = !LESSONS[lesson].repertoire;
  const points: TrendPoint[] = [];
  for (const day of Object.keys(progress.days).sort()) {
    const ld = progress.days[day].lessons?.[lesson];
    if (!ld || ld.runs <= 0) continue;
    points.push({
      day,
      runs: ld.runs,
      pitch: ld.pitchSum / ld.runs,
      timing: ld.timingRuns > 0 ? ld.timingSum / ld.timingRuns : null,
      level: leveled ? ld.levelSum / ld.runs : null,
    });
  }
  return points.slice(-maxDays);
}

export interface CalendarCell {
  day: string;
  /** After today: drawn empty. */
  future: boolean;
  minutes: number;
  exercises: number;
  /** 0 = no practice, 1–4 = more minutes. */
  intensity: 0 | 1 | 2 | 3 | 4;
  /** Lessons practiced that day (empty for days recorded before the breakdown). */
  lessons: LessonId[];
}

export interface CalendarWeek {
  /** Monday first. */
  days: CalendarCell[];
  /** Short month name when this week holds the 1st of a month, or is the first week shown. */
  month: string | null;
}

export const CALENDAR_WEEKS = 17;

/** Minutes to shade: any practice, 10+, 20+, 40+ minutes. */
function intensity(minutes: number, exercises: number): CalendarCell['intensity'] {
  if (exercises <= 0 && minutes <= 0) return 0;
  if (minutes >= 40) return 4;
  if (minutes >= 20) return 3;
  if (minutes >= 10) return 2;
  return 1;
}

/** Monday-first weeks up to the week holding `today`, oldest first. */
export function calendarWeeks(progress: ProgressState, today: Date, weeks = CALENDAR_WEEKS): CalendarWeek[] {
  const todayKey = dayKey(today);
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = addDays(todayKey, -mondayOffset - 7 * (weeks - 1));
  const out: CalendarWeek[] = [];
  for (let w = 0; w < weeks; w++) {
    const days: CalendarCell[] = [];
    let month: string | null = null;
    for (let d = 0; d < 7; d++) {
      const key = addDays(start, w * 7 + d);
      const log = progress.days[key];
      const minutes = log ? Math.round(log.practiceMs / 60000) : 0;
      const exercises = log?.exercises ?? 0;
      const lessons = (Object.keys(LESSONS) as LessonId[]).filter((l) => (log?.lessons?.[l]?.runs ?? 0) > 0);
      if (key.endsWith('-01') || (w === 0 && d === 0)) month = dayDate(key).toLocaleDateString('en-US', { month: 'short' });
      days.push({ day: key, future: key > todayKey, minutes, exercises, intensity: intensity(minutes, exercises), lessons });
    }
    out.push({ days, month });
  }
  // Two labels in adjacent columns would overlap: the first week's yields to the 1st of a month.
  if (out.length > 1 && out[1].month) out[0].month = null;
  return out;
}

/** "Nov 3" for a day key. */
export function shortDate(key: string): string {
  return dayDate(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
