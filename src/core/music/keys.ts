import { LETTERS, type Letter, makePitch, mod, type SpelledPitch, stepToLetter, stepToOctave } from './pitch';

export type Mode = 'major' | 'minor';

export interface KeySignature {
  id: string;
  label: string;
  tonic: Letter;
  tonicAlter: number;
  mode: Mode;
  /** Positive = sharps, negative = flats. */
  fifths: number;
  /** VexFlow key signature spec ("Bb", "F#m"). */
  vexKey: string;
  /** Lowest difficulty level at which "auto" may pick this key. */
  minLevel: number;
}

const SHARP_ORDER: Letter[] = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER: Letter[] = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

function k(
  id: string,
  tonic: Letter,
  tonicAlter: number,
  mode: Mode,
  fifths: number,
  minLevel: number,
): KeySignature {
  const acc = tonicAlter === 1 ? '#' : tonicAlter === -1 ? 'b' : '';
  const uni = tonicAlter === 1 ? '♯' : tonicAlter === -1 ? '♭' : '';
  return {
    id,
    label: `${tonic}${uni} ${mode}`,
    tonic,
    tonicAlter,
    mode,
    fifths,
    vexKey: `${tonic}${acc}${mode === 'minor' ? 'm' : ''}`,
    minLevel,
  };
}

/** Keys offered by the generator, roughly ordered by pedagogical difficulty. */
export const KEYS: readonly KeySignature[] = [
  k('C', 'C', 0, 'major', 0, 1),
  k('G', 'G', 0, 'major', 1, 16),
  k('F', 'F', 0, 'major', -1, 16),
  k('D', 'D', 0, 'major', 2, 30),
  k('Bb', 'B', -1, 'major', -2, 30),
  k('Am', 'A', 0, 'minor', 0, 36),
  k('Em', 'E', 0, 'minor', 1, 40),
  k('Dm', 'D', 0, 'minor', -1, 40),
  k('A', 'A', 0, 'major', 3, 46),
  k('Eb', 'E', -1, 'major', -3, 46),
  k('Bm', 'B', 0, 'minor', 2, 56),
  k('Gm', 'G', 0, 'minor', -2, 56),
  k('E', 'E', 0, 'major', 4, 61),
  k('Ab', 'A', -1, 'major', -4, 61),
  k('F#m', 'F', 1, 'minor', 3, 70),
  k('Cm', 'C', 0, 'minor', -3, 70),
  k('B', 'B', 0, 'major', 5, 76),
  k('Db', 'D', -1, 'major', -5, 76),
  k('C#m', 'C', 1, 'minor', 4, 84),
  k('Fm', 'F', 0, 'minor', -4, 84),
  k('F#', 'F', 1, 'major', 6, 90),
  k('Gb', 'G', -1, 'major', -6, 90),
];

export function getKey(id: string): KeySignature {
  return KEYS.find((key) => key.id === id) ?? KEYS[0];
}

/** Alteration implied by the key signature for each letter. */
export function keyAlters(fifths: number): Record<Letter, number> {
  const alters: Record<Letter, number> = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 };
  if (fifths > 0) SHARP_ORDER.slice(0, fifths).forEach((l) => (alters[l] = 1));
  if (fifths < 0) FLAT_ORDER.slice(0, -fifths).forEach((l) => (alters[l] = -1));
  return alters;
}

export function tonicLetterIndex(key: KeySignature): number {
  return LETTERS.indexOf(key.tonic);
}

/** Scale degree (0 = tonic … 6) of a diatonic step in this key. */
export function scaleDegree(key: KeySignature, step: number): number {
  return mod(step - tonicLetterIndex(key), 7);
}

/** Diatonic pitch for a step, spelled with the key signature. */
export function stepToPitch(key: KeySignature, step: number, extraAlter = 0): SpelledPitch {
  const letter = stepToLetter(step);
  const alter = keyAlters(key.fifths)[letter] + extraAlter;
  return makePitch(letter, alter, stepToOctave(step));
}

export function stepToMidi(key: KeySignature, step: number, extraAlter = 0): number {
  return stepToPitch(key, step, extraAlter).midi;
}

/**
 * Tracks accidentals within one measure on one staff so we know when an accidental
 * (or a cancelling natural) has to be printed.
 */
export class MeasureAccidentals {
  private readonly alters: Record<Letter, number>;
  private readonly overrides = new Map<string, number>();

  constructor(fifths: number) {
    this.alters = keyAlters(fifths);
  }

  /** Returns the accidental to print (e.g. "#", "n", "b") or null. Updates state. */
  accidentalFor(p: Pick<SpelledPitch, 'letter' | 'alter' | 'octave'>): string | null {
    const slot = `${p.letter}${p.octave}`;
    const current = this.overrides.has(slot) ? this.overrides.get(slot)! : this.alters[p.letter];
    if (current === p.alter) return null;
    this.overrides.set(slot, p.alter);
    return p.alter === 0 ? 'n' : p.alter === 1 ? '#' : p.alter === -1 ? 'b' : p.alter === 2 ? '##' : 'bb';
  }
}

/** Prefer flat spellings for black keys in flat keys. */
export function prefersFlats(key: KeySignature): boolean {
  return key.fifths < 0;
}

const LETTER_FIFTHS: Readonly<Record<Letter, number>> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
const MAJOR_BY_FIFTHS: Readonly<Record<string, string>> = {
  '-7': 'Cb', '-6': 'Gb', '-5': 'Db', '-4': 'Ab', '-3': 'Eb', '-2': 'Bb', '-1': 'F', '0': 'C',
  '1': 'G', '2': 'D', '3': 'A', '4': 'E', '5': 'B', '6': 'F#', '7': 'C#',
};

/**
 * Any major or minor key (not only the generator's list), e.g. G♯ minor for scales.
 * The VexFlow spec is the relative major's, which has the same signature.
 */
export function makeKeySignature(tonic: Letter, tonicAlter: number, mode: Mode): KeySignature {
  const fifths = LETTER_FIFTHS[tonic] + 7 * tonicAlter - (mode === 'minor' ? 3 : 0);
  const acc = tonicAlter === 1 ? '#' : tonicAlter === -1 ? 'b' : '';
  const base = k(`${tonic}${acc}${mode === 'minor' ? 'm' : ''}`, tonic, tonicAlter, mode, fifths, 1);
  return { ...base, vexKey: MAJOR_BY_FIFTHS[String(fifths)] ?? base.vexKey };
}
