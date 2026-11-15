/** Local calendar days as YYYY-MM-DD keys (shared by progress, repertoire and trends). */

/** Local calendar day, YYYY-MM-DD. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The local date (noon, so DST never moves it across midnight) of a day key. */
export function dayDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

/** The key `n` days after (or before, if negative) a day key. */
export function addDays(key: string, n: number): string {
  const d = dayDate(key);
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12));
}

export function previousDay(key: string): string {
  return addDays(key, -1);
}

export function isDayKey(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}
