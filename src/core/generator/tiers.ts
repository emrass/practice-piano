export interface Tier {
  id: string;
  name: string;
  minLevel: number;
  maxLevel: number;
  /** Distinct passages that must be passed (>= 90 % pitch accuracy) to master the tier. */
  passesRequired: number;
  summary: string;
}

/**
 * Difficulty bands. The beginner range (1–15) is split finely so the first steps feel
 * achievable; later tiers are wider.
 */
export const TIERS: readonly Tier[] = [
  { id: 't01', name: 'First Note', minLevel: 1, maxLevel: 3, passesRequired: 3, summary: 'One note, steady rhythms' },
  { id: 't02', name: 'Two & Three Notes', minLevel: 4, maxLevel: 6, passesRequired: 3, summary: 'C–D–E by step' },
  { id: 't03', name: 'Four Notes', minLevel: 7, maxLevel: 9, passesRequired: 3, summary: 'C to F, first skips' },
  { id: 't04', name: 'Five-Finger C', minLevel: 10, maxLevel: 12, passesRequired: 3, summary: 'C position, C to G' },
  { id: 't05', name: 'Five-Finger Fluency', minLevel: 13, maxLevel: 15, passesRequired: 4, summary: 'Skips & rests in C position' },
  { id: 't06', name: 'Octave Explorer', minLevel: 16, maxLevel: 25, passesRequired: 4, summary: 'A full octave, G & F major, 3/4' },
  { id: 't07', name: 'Ledger Lines & Leaps', minLevel: 26, maxLevel: 35, passesRequired: 4, summary: 'Eighth notes, wider leaps' },
  { id: 't08', name: 'Key Signatures', minLevel: 36, maxLevel: 45, passesRequired: 5, summary: 'Two accidentals, minor keys, dyads' },
  { id: 't09', name: 'Eighth-Note Flow', minLevel: 46, maxLevel: 55, passesRequired: 5, summary: 'Dotted rhythms, 6/8' },
  { id: 't10', name: 'Dyads & Dotted Rhythms', minLevel: 56, maxLevel: 65, passesRequired: 5, summary: 'Three-note chords, wider range' },
  { id: 't11', name: 'Chords & Accidentals', minLevel: 66, maxLevel: 75, passesRequired: 5, summary: 'Chromatic notes, four sharps/flats' },
  { id: 't12', name: 'Sixteenths & Independence', minLevel: 76, maxLevel: 85, passesRequired: 5, summary: '16th notes, syncopation' },
  { id: 't13', name: 'Advanced Reader', minLevel: 86, maxLevel: 95, passesRequired: 6, summary: 'Dense chords, remote keys' },
  { id: 't14', name: 'Virtuoso', minLevel: 96, maxLevel: 100, passesRequired: 6, summary: 'Everything at once' },
];

export function tierForLevel(level: number): Tier {
  const l = clampLevel(level);
  return TIERS.find((t) => l >= t.minLevel && l <= t.maxLevel) ?? TIERS[TIERS.length - 1];
}

export function tierIndex(tierId: string): number {
  return TIERS.findIndex((t) => t.id === tierId);
}

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.min(100, Math.max(1, Math.round(level)));
}
