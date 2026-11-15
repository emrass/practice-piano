import { LESSONS, type LessonId } from '../lessons';
import { dayDate } from './days';
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

/** "Nov 3" for a day key. */
export function shortDate(key: string): string {
  return dayDate(key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
