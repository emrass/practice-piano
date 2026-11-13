import type { Tier } from '../generator/tiers';

/**
 * Rhythm bands (see docs/DIDACTICS.md §4.3). Pass = ≥ 90 % hits and ≥ 70 % timing accuracy.
 */
export const RHYTHM_TIERS: readonly Tier[] = [
  { id: 'r01', name: 'Steady Beat', minLevel: 1, maxLevel: 8, passesRequired: 3, summary: 'Quarters, halves and wholes in 4/4' },
  { id: 'r02', name: 'Rests & Meters', minLevel: 9, maxLevel: 16, passesRequired: 3, summary: 'Quarter and half rests, 3/4 and 2/4' },
  { id: 'r03', name: 'Eighth Notes', minLevel: 17, maxLevel: 26, passesRequired: 4, summary: 'Eighth pairs and runs' },
  { id: 'r04', name: 'Off-beats', minLevel: 27, maxLevel: 36, passesRequired: 4, summary: 'Eighth rests, notes on “and”' },
  { id: 'r05', name: 'Dotted Rhythms', minLevel: 37, maxLevel: 46, passesRequired: 4, summary: 'Dotted quarter + eighth' },
  { id: 'r06', name: 'Syncopation', minLevel: 47, maxLevel: 56, passesRequired: 5, summary: 'Eighth–quarter–eighth across the beat' },
  { id: 'r07', name: 'Sixteenths', minLevel: 57, maxLevel: 66, passesRequired: 5, summary: 'Four sixteenths, eighth + two sixteenths' },
  { id: 'r08', name: 'Compound Time', minLevel: 67, maxLevel: 74, passesRequired: 5, summary: '6/8 — two beats of three eighths' },
  { id: 'r09', name: 'Dotted Sixteenths', minLevel: 75, maxLevel: 82, passesRequired: 5, summary: 'Dotted eighth + sixteenth, mixed figures' },
  { id: 'r10', name: 'Hand Independence', minLevel: 83, maxLevel: 91, passesRequired: 6, summary: 'Interlocking hands, faster tempos' },
  { id: 'r11', name: 'Polyrhythms', minLevel: 92, maxLevel: 100, passesRequired: 6, summary: '3 against 2, 4 against 3' },
];

export function rhythmTierForLevel(level: number): Tier {
  const l = Math.min(100, Math.max(1, Math.round(level)));
  return RHYTHM_TIERS.find((t) => l >= t.minLevel && l <= t.maxLevel) ?? RHYTHM_TIERS[RHYTHM_TIERS.length - 1];
}
