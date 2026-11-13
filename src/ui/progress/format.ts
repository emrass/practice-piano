/** Formatting helpers shared by the Progress tab's lesson views. */

export const DAY = 24 * 60 * 60 * 1000;

/** A 0–1 ratio as a whole percentage, or a dash when there is no data. */
export function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}

/** Red (≤50%) to green (100%) for an accuracy ratio. */
export function heatColor(acc: number): string {
  const hue = Math.max(0, Math.min(120, (acc - 0.5) * 240));
  return `hsl(${hue} 65% 48%)`;
}

/** "centred", "12 ms early" or "20 ms late"; empty without data. */
export function tendencyText(ms: number | null): string {
  if (ms === null) return '';
  if (Math.abs(ms) < 8) return 'centred';
  return `${Math.abs(ms)} ms ${ms < 0 ? 'early' : 'late'}`;
}
