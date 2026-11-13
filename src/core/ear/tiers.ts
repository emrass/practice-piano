import type { Tier } from '../generator/tiers';

/** Ear-training bands. Pass = ≥ 90 % of the notes found without wrong presses or hints. */
export const EAR_TIERS: readonly Tier[] = [
  { id: 'e01', name: 'Echo: Two Notes', minLevel: 1, maxLevel: 6, passesRequired: 3, summary: 'C D E — up or down a step' },
  { id: 'e02', name: 'Three-Note Steps', minLevel: 7, maxLevel: 12, passesRequired: 3, summary: 'Stepwise tunes in C position' },
  { id: 'e03', name: 'Five-Finger Tunes', minLevel: 13, maxLevel: 20, passesRequired: 4, summary: 'Steps and skips, C to G' },
  { id: 'e04', name: 'Octave Melodies', minLevel: 21, maxLevel: 30, passesRequired: 4, summary: 'A full octave, leaps up to a 5th' },
  { id: 'e05', name: 'Wider Leaps', minLevel: 31, maxLevel: 40, passesRequired: 4, summary: 'Leaps to the octave, G and F major' },
  { id: 'e06', name: 'New Keys', minLevel: 41, maxLevel: 50, passesRequired: 5, summary: 'A cadence sets the key first' },
  { id: 'e07', name: 'Minor Keys', minLevel: 51, maxLevel: 60, passesRequired: 5, summary: 'Natural and harmonic minor' },
  { id: 'e08', name: 'Harmonic Intervals', minLevel: 61, maxLevel: 70, passesRequired: 5, summary: 'Two notes at once' },
  { id: 'e09', name: 'Triads', minLevel: 71, maxLevel: 80, passesRequired: 5, summary: 'Major and minor chords' },
  { id: 'e10', name: 'Key Only', minLevel: 81, maxLevel: 90, passesRequired: 6, summary: 'No starting note — find it from the key' },
  { id: 'e11', name: 'Inversions & Sevenths', minLevel: 91, maxLevel: 100, passesRequired: 6, summary: 'Chord colours and chromatic notes' },
];

export function earTierForLevel(level: number): Tier {
  const l = Math.min(100, Math.max(1, Math.round(level)));
  return EAR_TIERS.find((t) => l >= t.minLevel && l <= t.maxLevel) ?? EAR_TIERS[EAR_TIERS.length - 1];
}
