import { LETTER_PC, LETTERS, accidentalText, mod, type Letter } from '../music/pitch';

/**
 * Scales & arpeggios (docs/DIDACTICS.md §4.4) are a fixed repertoire: the catalogue below
 * defines every scale and arpeggio type by its degrees. Freshness comes from shuffling keys,
 * spaced review and the tempo ladder, never from random notes.
 */
export type ScaleTypeId =
  | 'major'
  | 'natural-minor'
  | 'harmonic-minor'
  | 'melodic-minor'
  | 'chromatic'
  | 'pentatonic-major'
  | 'pentatonic-minor'
  | 'blues'
  | 'arp-major'
  | 'arp-minor'
  | 'arp-dom7'
  | 'arp-dim7';

export type ScaleHands = 'rh' | 'lh' | 'together' | 'contrary';
export type NoteValue = 'quarter' | 'eighth' | 'sixteenth';

/** A scale degree relative to the key tonic: letter steps and semitones. */
export interface Degree {
  steps: number;
  semis: number;
}

export interface ScaleTypeDef {
  id: ScaleTypeId;
  name: string;
  kind: 'scale' | 'arpeggio';
  /** Key signature shown: the tonic's major or minor key, or none (chromatic). */
  keyMode: 'major' | 'minor' | 'none';
  /** One octave going up, from the first note (not repeated at the top). */
  asc: readonly Degree[];
  /** One octave as used going down, in ascending order (melodic minor, blues). */
  desc?: readonly Degree[];
  /** Contrary motion makes sense (scales that start on the tonic). */
  contrary: boolean;
  /** Keys offered, as tonic names. */
  tonics: readonly string[];
}

const d = (steps: number, semis: number): Degree => ({ steps, semis });

const MAJOR_TONICS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'] as const;
const MINOR_TONICS = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'Eb', 'Bb', 'F', 'C', 'G', 'D'] as const;
const CHROMATIC_TONICS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

const MAJOR = [d(0, 0), d(1, 2), d(2, 4), d(3, 5), d(4, 7), d(5, 9), d(6, 11)];
const NATURAL = [d(0, 0), d(1, 2), d(2, 3), d(3, 5), d(4, 7), d(5, 8), d(6, 10)];

export const SCALE_TYPES: Readonly<Record<ScaleTypeId, ScaleTypeDef>> = {
  major: { id: 'major', name: 'Major', kind: 'scale', keyMode: 'major', asc: MAJOR, contrary: true, tonics: MAJOR_TONICS },
  'natural-minor': { id: 'natural-minor', name: 'Natural minor', kind: 'scale', keyMode: 'minor', asc: NATURAL, contrary: true, tonics: MINOR_TONICS },
  'harmonic-minor': {
    id: 'harmonic-minor',
    name: 'Harmonic minor',
    kind: 'scale',
    keyMode: 'minor',
    asc: [d(0, 0), d(1, 2), d(2, 3), d(3, 5), d(4, 7), d(5, 8), d(6, 11)],
    contrary: true,
    tonics: MINOR_TONICS,
  },
  'melodic-minor': {
    id: 'melodic-minor',
    name: 'Melodic minor',
    kind: 'scale',
    keyMode: 'minor',
    asc: [d(0, 0), d(1, 2), d(2, 3), d(3, 5), d(4, 7), d(5, 9), d(6, 11)],
    desc: NATURAL,
    contrary: true,
    tonics: MINOR_TONICS,
  },
  chromatic: {
    id: 'chromatic',
    name: 'Chromatic',
    kind: 'scale',
    keyMode: 'none',
    // Spelled by direction (sharps up, flats down) in the generator; steps are placeholders.
    asc: Array.from({ length: 12 }, (_, i) => d(0, i)),
    contrary: true,
    tonics: CHROMATIC_TONICS,
  },
  'pentatonic-major': {
    id: 'pentatonic-major',
    name: 'Major pentatonic',
    kind: 'scale',
    keyMode: 'major',
    asc: [d(0, 0), d(1, 2), d(2, 4), d(4, 7), d(5, 9)],
    contrary: false,
    tonics: MAJOR_TONICS,
  },
  'pentatonic-minor': {
    id: 'pentatonic-minor',
    name: 'Minor pentatonic',
    kind: 'scale',
    keyMode: 'minor',
    asc: [d(0, 0), d(2, 3), d(3, 5), d(4, 7), d(6, 10)],
    contrary: false,
    tonics: MINOR_TONICS,
  },
  blues: {
    id: 'blues',
    name: 'Blues',
    kind: 'scale',
    keyMode: 'minor',
    asc: [d(0, 0), d(2, 3), d(3, 5), d(3, 6), d(4, 7), d(6, 10)], // ♯4 going up
    desc: [d(0, 0), d(2, 3), d(3, 5), d(4, 6), d(4, 7), d(6, 10)], // ♭5 coming down
    contrary: false,
    tonics: MINOR_TONICS,
  },
  'arp-major': { id: 'arp-major', name: 'Major arpeggio', kind: 'arpeggio', keyMode: 'major', asc: [d(0, 0), d(2, 4), d(4, 7)], contrary: false, tonics: MAJOR_TONICS },
  'arp-minor': { id: 'arp-minor', name: 'Minor arpeggio', kind: 'arpeggio', keyMode: 'minor', asc: [d(0, 0), d(2, 3), d(4, 7)], contrary: false, tonics: MINOR_TONICS },
  // Dominant 7th "in" a major key: starts on the 5th degree (G7 in C).
  'arp-dom7': {
    id: 'arp-dom7',
    name: 'Dominant 7th',
    kind: 'arpeggio',
    keyMode: 'major',
    asc: [d(4, 7), d(6, 11), d(8, 14), d(10, 17)],
    contrary: false,
    tonics: MAJOR_TONICS,
  },
  // Diminished 7th "in" a minor key: starts on the leading note (B° 7 in C minor).
  'arp-dim7': {
    id: 'arp-dim7',
    name: 'Diminished 7th',
    kind: 'arpeggio',
    keyMode: 'minor',
    asc: [d(6, 11), d(8, 14), d(10, 17), d(12, 20)],
    contrary: false,
    tonics: MINOR_TONICS,
  },
};

export const SCALE_TYPE_IDS = Object.keys(SCALE_TYPES) as ScaleTypeId[];

export function isTriadArpeggio(type: ScaleTypeId): boolean {
  return type === 'arp-major' || type === 'arp-minor';
}

/** "F#" → { letter: 'F', alter: 1 }. */
export function parseTonic(name: string): { letter: Letter; alter: number } {
  const letter = name[0].toUpperCase() as Letter;
  if (!LETTERS.includes(letter)) throw new Error(`Bad tonic: ${name}`);
  const rest = name.slice(1);
  const alter = rest === '#' ? 1 : rest === '##' ? 2 : rest === 'b' ? -1 : rest === 'bb' ? -2 : 0;
  return { letter, alter };
}

export function tonicLabel(name: string): string {
  return name.replace('#', '♯').replace(/b$/, '♭');
}

/** Identity of one practice item: type × key × hands (octaves and rhythm are presentation). */
export interface ScaleItem {
  type: ScaleTypeId;
  tonic: string;
  hands: ScaleHands;
}

export function itemId(item: ScaleItem): string {
  return `${item.type}/${item.tonic}/${item.hands}`;
}

export function parseItemId(id: string): ScaleItem | null {
  const [type, tonic, hands] = id.split('/');
  if (!(type in SCALE_TYPES) || !tonic || !['rh', 'lh', 'together', 'contrary'].includes(hands)) return null;
  if (!SCALE_TYPES[type as ScaleTypeId].tonics.includes(tonic)) return null;
  return { type: type as ScaleTypeId, tonic, hands: hands as ScaleHands };
}

export const HANDS_LABEL: Readonly<Record<ScaleHands, string>> = {
  rh: 'Right hand',
  lh: 'Left hand',
  together: 'Hands together',
  contrary: 'Contrary motion',
};

export const NOTE_VALUE_LABEL: Readonly<Record<NoteValue, string>> = {
  quarter: 'Quarters',
  eighth: 'Eighths',
  sixteenth: 'Sixteenths',
};

/** Name of the note `deg` above a tonic, e.g. the dominant of F is "C". */
export function degreeName(tonic: string, deg: Degree): string {
  const { letter, alter } = parseTonic(tonic);
  const l = LETTERS[(LETTERS.indexOf(letter) + deg.steps) % 7];
  const a = mod(LETTER_PC[letter] + alter + deg.semis - LETTER_PC[l] + 6, 12) - 6;
  return `${l}${accidentalText(a)}`;
}

/** "D major scale", "Dominant 7th in C (G7)", "Chromatic scale on E♭". */
export function itemTitle(type: ScaleTypeId, tonic: string): string {
  const t = tonicLabel(tonic);
  switch (type) {
    case 'major':
      return `${t} major scale`;
    case 'natural-minor':
      return `${t} natural minor scale`;
    case 'harmonic-minor':
      return `${t} harmonic minor scale`;
    case 'melodic-minor':
      return `${t} melodic minor scale`;
    case 'chromatic':
      return `Chromatic scale on ${t}`;
    case 'pentatonic-major':
      return `${t} major pentatonic`;
    case 'pentatonic-minor':
      return `${t} minor pentatonic`;
    case 'blues':
      return `${t} blues scale`;
    case 'arp-major':
      return `${t} major arpeggio`;
    case 'arp-minor':
      return `${t} minor arpeggio`;
    case 'arp-dom7':
      return `Dominant 7th in ${t} (${degreeName(tonic, { steps: 4, semis: 7 })}7)`;
    case 'arp-dim7':
      return `Diminished 7th in ${t} minor (on ${degreeName(tonic, { steps: 6, semis: 11 })})`;
  }
}

export function itemLabel(item: ScaleItem): string {
  return `${itemTitle(item.type, item.tonic)} · ${HANDS_LABEL[item.hands].toLowerCase()}`;
}
