/** Formatting helpers shared by the Progress tab's lesson views. */

export const DAY = 24 * 60 * 60 * 1000;

/** A 0–1 ratio as a whole percentage, or a dash when there is no data. */
export function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}

export type HeatBand = 1 | 2 | 3 | 4 | 5;

/** The bands of the Heatmap (design/system/components/Heatmap), lowest first, with the legend's words. */
export const HEAT_BANDS: readonly { band: HeatBand; from: number; label: string }[] = [
  { band: 1, from: 0, label: 'under 60%' },
  { band: 2, from: 60, label: '60–74%' },
  { band: 3, from: 75, label: '75–84%' },
  { band: 4, from: 85, label: '85–94%' },
  { band: 5, from: 95, label: '95% and up' },
];

/** The band of an accuracy ratio, by the whole percentage shown beside it (0.745 reads 75%: band 3). */
export function heatBand(acc: number): HeatBand {
  const percent = Math.round(acc * 100);
  let band: HeatBand = 1;
  for (const b of HEAT_BANDS) if (percent >= b.from) band = b.band;
  return band;
}

/** "centered", "12 ms early" or "20 ms late"; empty without data. */
export function tendencyText(ms: number | null): string {
  if (ms === null) return '';
  if (Math.abs(ms) < 8) return 'centered';
  return `${Math.abs(ms)} ms ${ms < 0 ? 'early' : 'late'}`;
}
