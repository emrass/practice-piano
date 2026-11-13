import type { Hand } from '../exercise';
import { type Letter } from '../music/pitch';
import { isTriadArpeggio, type ScaleTypeId } from './catalog';

/**
 * Standard fingerings. A pattern gives the finger for each degree of the octave cycle
 * ("inner", used everywhere the hand passes through), plus the finger on the lowest and
 * highest note where that differs (RH ends on 5, LH starts on 5 …). Fingering is shown,
 * never graded (DIDACTICS §1.5); where there is no settled standard we show none.
 */
export interface FingerPattern {
  inner: readonly number[];
  first?: number;
  last?: number;
}

const p = (inner: number[], first?: number, last?: number): FingerPattern => ({ inner, first, last });

const RH_WHITE = p([1, 2, 3, 1, 2, 3, 4], undefined, 5);
const RH_F = p([1, 2, 3, 4, 1, 2, 3], undefined, 4);
const LH_WHITE = p([1, 4, 3, 2, 1, 3, 2], 5);
const LH_B = p([1, 3, 2, 1, 4, 3, 2], 4);

const MAJOR: Record<Hand, Record<string, FingerPattern>> = {
  rh: {
    C: RH_WHITE, G: RH_WHITE, D: RH_WHITE, A: RH_WHITE, E: RH_WHITE, B: RH_WHITE,
    F: RH_F,
    Bb: p([4, 1, 2, 3, 1, 2, 3], 2),
    Eb: p([3, 1, 2, 3, 4, 1, 2]),
    Ab: p([3, 4, 1, 2, 3, 1, 2]),
    Db: p([2, 3, 1, 2, 3, 4, 1]),
    'F#': p([2, 3, 4, 1, 2, 3, 1]),
  },
  lh: {
    C: LH_WHITE, G: LH_WHITE, D: LH_WHITE, A: LH_WHITE, E: LH_WHITE, F: LH_WHITE,
    B: LH_B,
    Bb: p([3, 2, 1, 4, 3, 2, 1]),
    Eb: p([3, 2, 1, 4, 3, 2, 1]),
    Ab: p([3, 2, 1, 4, 3, 2, 1]),
    Db: p([3, 2, 1, 4, 3, 2, 1]),
    'F#': p([4, 3, 2, 1, 3, 2, 1]),
  },
};

/** Harmonic-minor fingerings; also used for natural and melodic minor. */
const MINOR: Record<Hand, Record<string, FingerPattern>> = {
  rh: {
    A: RH_WHITE, E: RH_WHITE, B: RH_WHITE, C: RH_WHITE, G: RH_WHITE, D: RH_WHITE,
    F: RH_F,
    'F#': p([3, 4, 1, 2, 3, 1, 2]),
    'C#': p([3, 4, 1, 2, 3, 1, 2]),
    'G#': p([3, 4, 1, 2, 3, 1, 2]),
    Eb: p([3, 1, 2, 3, 4, 1, 2]),
    Bb: p([4, 1, 2, 3, 1, 2, 3], 2),
  },
  lh: {
    A: LH_WHITE, E: LH_WHITE, C: LH_WHITE, G: LH_WHITE, D: LH_WHITE, F: LH_WHITE,
    B: LH_B,
    'F#': p([4, 3, 2, 1, 3, 2, 1]),
    'C#': p([3, 2, 1, 4, 3, 2, 1]),
    'G#': p([3, 2, 1, 4, 3, 2, 1]),
    Eb: p([2, 1, 4, 3, 2, 1, 3]),
    Bb: p([2, 1, 3, 2, 1, 4, 3]),
  },
};

export interface FingerNote {
  midi: number;
  letter: Letter;
  alter: number;
  /** Index of the degree in the type's octave cycle. */
  degree: number;
}

function isBlack(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

/** Pattern for a scale/arpeggio type in a key, or null when no standard fingering is shown. */
export function fingerPattern(type: ScaleTypeId, tonic: string, hand: Hand, rootIsWhite: boolean, thirdIsBlack: boolean): FingerPattern | null {
  switch (type) {
    case 'major':
      return MAJOR[hand][tonic] ?? null;
    case 'natural-minor':
    case 'harmonic-minor':
    case 'melodic-minor':
      return MINOR[hand][tonic] ?? null;
    case 'arp-major':
    case 'arp-minor':
      if (rootIsWhite) return hand === 'rh' ? p([1, 2, 3], undefined, 5) : p([1, thirdIsBlack ? 3 : 4, 2], 5);
      // Black-key major triads (D♭, E♭, A♭, B♭): the common right-hand fingering only.
      if (type === 'arp-major' && hand === 'rh' && ['Db', 'Eb', 'Ab', 'Bb'].includes(tonic)) return p([4, 1, 2], 2);
      return null;
    case 'arp-dom7':
    case 'arp-dim7':
      if (!rootIsWhite) return null;
      return hand === 'rh' ? p([1, 2, 3, 4], undefined, 5) : p([1, 4, 3, 2], 5);
    default:
      return null;
  }
}

/**
 * Fingers for one hand's notes, in playing order. Returns null when there is no standard
 * fingering for this type and key.
 */
export function fingerNotes(type: ScaleTypeId, tonic: string, hand: Hand, notes: readonly FingerNote[]): number[] | null {
  if (!notes.length) return [];
  const lowest = Math.min(...notes.map((n) => n.midi));
  const highest = Math.max(...notes.map((n) => n.midi));
  if (type === 'chromatic') {
    // Black keys 3, white keys 1 — except the white key after a white key: RH F and C, LH E and B.
    const twos: Letter[] = hand === 'rh' ? ['F', 'C'] : ['E', 'B'];
    return notes.map((n) => {
      if (isBlack(n.midi)) return 3;
      const atEnd = (hand === 'rh' && n.midi === lowest) || (hand === 'lh' && n.midi === highest);
      return twos.includes(n.letter) && !atEnd ? 2 : 1;
    });
  }
  const root = notes.find((n) => n.degree === 0) ?? notes[0];
  const third = notes.find((n) => n.degree === 1);
  const pattern = fingerPattern(type, tonic, hand, !isBlack(root.midi), !!third && isBlack(third.midi) && isTriadArpeggio(type));
  if (!pattern) return null;
  return notes.map((n) => {
    if (n.midi === lowest && pattern.first !== undefined) return pattern.first;
    if (n.midi === highest && pattern.last !== undefined) return pattern.last;
    return pattern.inner[n.degree] ?? 1;
  });
}

export type Crossing = 'thumb-under' | 'finger-over';

/**
 * Where the hand has to cross: a finger change against the direction of travel
 * (RH going up: 3 → 1 is the thumb passing under; going down 1 → 3 a finger crossing over).
 */
export function crossingAt(hand: Hand, prevFinger: number, finger: number, ascending: boolean): Crossing | null {
  const natural = (hand === 'rh') === ascending ? 1 : -1;
  const sign = Math.sign(finger - prevFinger);
  if (sign === 0 || sign === natural) return null;
  return finger === 1 ? 'thumb-under' : 'finger-over';
}
