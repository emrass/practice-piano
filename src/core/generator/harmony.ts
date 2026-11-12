import type { Rng } from './rng';

/** Chord roots as scale degrees (0 = I … 6 = vii). */
export type Degree = number;

const AUTHENTIC_PHRASES: readonly Degree[][] = [
  [0, 3, 4, 0],
  [0, 5, 4, 0],
  [0, 1, 4, 0],
  [0, 4, 4, 0],
  [0, 3, 3, 0],
];

const HALF_CADENCE_PHRASES: readonly Degree[][] = [
  [0, 3, 0, 4],
  [0, 5, 3, 4],
  [0, 1, 0, 4],
  [0, 0, 3, 4],
];

/**
 * One chord per bar. Phrases are four bars; every second phrase (and the last) closes
 * with an authentic cadence, the others with a half cadence on V.
 */
export function progression(rng: Rng, bars: number, simple: boolean): Degree[] {
  if (simple) {
    // Beginner material: tonic throughout, dominant before the final bar.
    return Array.from({ length: bars }, (_, i) => (i === bars - 2 ? 4 : 0));
  }
  const out: Degree[] = [];
  const phrases = Math.ceil(bars / 4);
  for (let p = 0; p < phrases; p++) {
    const isLast = p === phrases - 1;
    const authentic = isLast || p % 2 === 1;
    let phrase = [...rng.pick(authentic ? AUTHENTIC_PHRASES : HALF_CADENCE_PHRASES)];
    if (p === 0) phrase[0] = 0; // always begin on the tonic
    if (isLast && bars % 4 !== 0) phrase = phrase.slice(4 - (bars % 4));
    out.push(...phrase);
  }
  return out.slice(0, bars);
}

export function chordTones(root: Degree): number[] {
  return [root % 7, (root + 2) % 7, (root + 4) % 7];
}
