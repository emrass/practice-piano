import { makePitch, type PcSpelling, pitchClass, pitchLabel, type SpelledPitch } from '../music/pitch';
import { parseTonic, type Degree } from '../scales/catalog';
import { spellAbove } from '../scales/generator';

/**
 * Chords & progressions (docs/DIDACTICS.md §4.5) — fixed repertoire like scales: a chord
 * vocabulary drawn in shuffled order, and a library of standard progressions in every key.
 * Nothing here is a random chord chain.
 */
export type ChordQuality = 'maj' | 'min' | 'dim' | 'aug' | 'sus2' | 'sus4' | '7' | 'maj7' | 'm7' | 'm7b5' | 'dim7';

export interface QualityDef {
  id: ChordQuality;
  name: string;
  /** Symbol suffix after the root: C, Cm, C°, C+, Csus2, C7, Cmaj7, Cm7, Cø7, C°7. */
  suffix: string;
  /** Chord tones above the root, root included. */
  tones: readonly Degree[];
  /** Spell roots with flats (major-type chords) or sharps (minor-type chords). */
  roots: readonly string[];
}

const d = (steps: number, semis: number): Degree => ({ steps, semis });
const FLAT_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const SHARP_ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'] as const;

export const QUALITIES: Readonly<Record<ChordQuality, QualityDef>> = {
  maj: { id: 'maj', name: 'Major', suffix: '', tones: [d(0, 0), d(2, 4), d(4, 7)], roots: FLAT_ROOTS },
  min: { id: 'min', name: 'Minor', suffix: 'm', tones: [d(0, 0), d(2, 3), d(4, 7)], roots: SHARP_ROOTS },
  dim: { id: 'dim', name: 'Diminished', suffix: '°', tones: [d(0, 0), d(2, 3), d(4, 6)], roots: SHARP_ROOTS },
  aug: { id: 'aug', name: 'Augmented', suffix: '+', tones: [d(0, 0), d(2, 4), d(4, 8)], roots: FLAT_ROOTS },
  sus2: { id: 'sus2', name: 'Suspended 2nd', suffix: 'sus2', tones: [d(0, 0), d(1, 2), d(4, 7)], roots: FLAT_ROOTS },
  sus4: { id: 'sus4', name: 'Suspended 4th', suffix: 'sus4', tones: [d(0, 0), d(3, 5), d(4, 7)], roots: FLAT_ROOTS },
  '7': { id: '7', name: 'Dominant 7th', suffix: '7', tones: [d(0, 0), d(2, 4), d(4, 7), d(6, 10)], roots: FLAT_ROOTS },
  maj7: { id: 'maj7', name: 'Major 7th', suffix: 'maj7', tones: [d(0, 0), d(2, 4), d(4, 7), d(6, 11)], roots: FLAT_ROOTS },
  m7: { id: 'm7', name: 'Minor 7th', suffix: 'm7', tones: [d(0, 0), d(2, 3), d(4, 7), d(6, 10)], roots: SHARP_ROOTS },
  m7b5: { id: 'm7b5', name: 'Half-diminished', suffix: 'ø7', tones: [d(0, 0), d(2, 3), d(4, 6), d(6, 10)], roots: SHARP_ROOTS },
  dim7: { id: 'dim7', name: 'Diminished 7th', suffix: '°7', tones: [d(0, 0), d(2, 3), d(4, 6), d(6, 9)], roots: SHARP_ROOTS },
};

/** One chord: a root, a quality and which chord tone is in the bass. */
export interface ChordSpec {
  root: SpelledPitch;
  quality: ChordQuality;
  /** 0 = root position, 1 = first inversion (3rd in the bass), 2, 3. */
  inversion: number;
}

/** Chord tones spelled from a root (octave of the root, ascending). */
export function chordTones(root: SpelledPitch, quality: ChordQuality): SpelledPitch[] {
  return QUALITIES[quality].tones.map((t) => spellAbove(root, t));
}

/** Each pitch class of the chord spelled as the chord spells it (D♭7: D♭ F A♭ C♭). */
export function chordSpelling(spec: Pick<ChordSpec, 'root' | 'quality'>): PcSpelling {
  return new Map(chordTones(spec.root, spec.quality).map((p) => [pitchClass(p.midi), { letter: p.letter, alter: p.alter }]));
}

export function pcsOf(spec: Pick<ChordSpec, 'root' | 'quality'>): number[] {
  return chordTones(spec.root, spec.quality).map((p) => ((p.midi % 12) + 12) % 12);
}

export function bassOf(spec: ChordSpec): SpelledPitch {
  return chordTones(spec.root, spec.quality)[spec.inversion] ?? spec.root;
}

/** "Cm7", "F♯°", "C/E" (inversions as slash chords). */
export function chordSymbol(spec: ChordSpec): string {
  const base = `${pitchLabel(spec.root)}${QUALITIES[spec.quality].suffix}`;
  return spec.inversion > 0 ? `${base}/${pitchLabel(bassOf(spec))}` : base;
}

export function rootPitch(name: string, octave = 4): SpelledPitch {
  const { letter, alter } = parseTonic(name);
  return makePitch(letter, alter, octave);
}

// ---------------------------------------------------------------------------------------
// Chord vocabulary drills

export type ChordSetId = 'triads' | 'all-triads' | 'sus' | 'sevenths' | 'all-sevenths';

export const CHORD_SETS: Readonly<Record<ChordSetId, { name: string; qualities: readonly ChordQuality[] }>> = {
  triads: { name: 'Major & minor triads', qualities: ['maj', 'min'] },
  'all-triads': { name: 'All triads', qualities: ['maj', 'min', 'dim', 'aug'] },
  sus: { name: 'Suspended chords', qualities: ['sus2', 'sus4'] },
  sevenths: { name: 'Seventh chords', qualities: ['7', 'maj7', 'm7'] },
  'all-sevenths': { name: 'All sevenths', qualities: ['7', 'maj7', 'm7', 'm7b5', 'dim7'] },
};

export const CHORD_SET_IDS = Object.keys(CHORD_SETS) as ChordSetId[];

/** "C Cm C° C+" — a set's qualities shown on C. */
export function chordSetExamples(id: ChordSetId): string {
  return CHORD_SETS[id].qualities.map((q) => `C${QUALITIES[q].suffix}`).join(' ');
}

/** How a drill chord is shown: as a symbol, or written on the staff. */
export type ChordPrompt = 'symbol' | 'notation';
/** Which voicings count: any, root position only, or the inversion asked for. */
export type InversionRule = 'any' | 'root' | 'inversions';

// ---------------------------------------------------------------------------------------
// Progressions

/** A chord of a progression, relative to the key tonic. */
export interface ProgressionChord {
  numeral: string;
  root: Degree;
  quality: ChordQuality;
}

export interface ProgressionDef {
  id: string;
  name: string;
  mode: 'major' | 'minor';
  chords: readonly ProgressionChord[];
}

const MAJ = [d(0, 0), d(1, 2), d(2, 4), d(3, 5), d(4, 7), d(5, 9), d(6, 11)];
// Minor keys: natural minor, with the dominant from harmonic minor.
const MIN = [d(0, 0), d(1, 2), d(2, 3), d(3, 5), d(4, 7), d(5, 8), d(6, 10)];
const c = (numeral: string, degrees: readonly Degree[], degree: number, quality: ChordQuality): ProgressionChord => ({
  numeral,
  root: degrees[degree],
  quality,
});

export const PROGRESSIONS: readonly ProgressionDef[] = [
  { id: 'I-IV-V-I', name: 'I – IV – V – I', mode: 'major', chords: [c('I', MAJ, 0, 'maj'), c('IV', MAJ, 3, 'maj'), c('V', MAJ, 4, 'maj'), c('I', MAJ, 0, 'maj')] },
  { id: 'I-V-vi-IV', name: 'I – V – vi – IV (pop)', mode: 'major', chords: [c('I', MAJ, 0, 'maj'), c('V', MAJ, 4, 'maj'), c('vi', MAJ, 5, 'min'), c('IV', MAJ, 3, 'maj')] },
  { id: 'I-vi-IV-V', name: 'I – vi – IV – V (doo-wop)', mode: 'major', chords: [c('I', MAJ, 0, 'maj'), c('vi', MAJ, 5, 'min'), c('IV', MAJ, 3, 'maj'), c('V', MAJ, 4, 'maj')] },
  { id: 'ii-V-I', name: 'ii7 – V7 – Imaj7 (jazz)', mode: 'major', chords: [c('ii7', MAJ, 1, 'm7'), c('V7', MAJ, 4, '7'), c('Imaj7', MAJ, 0, 'maj7'), c('Imaj7', MAJ, 0, 'maj7')] },
  { id: 'i-iv-V-i', name: 'i – iv – V – i', mode: 'minor', chords: [c('i', MIN, 0, 'min'), c('iv', MIN, 3, 'min'), c('V', MIN, 4, 'maj'), c('i', MIN, 0, 'min')] },
  { id: 'minor-ii-V-i', name: 'iiø7 – V7 – i (minor jazz)', mode: 'minor', chords: [c('iiø7', MIN, 1, 'm7b5'), c('V7', MIN, 4, '7'), c('i', MIN, 0, 'min'), c('i', MIN, 0, 'min')] },
  { id: 'andalusian', name: 'i – VII – VI – V (Andalusian)', mode: 'minor', chords: [c('i', MIN, 0, 'min'), c('VII', MIN, 6, 'maj'), c('VI', MIN, 5, 'maj'), c('V', MIN, 4, 'maj')] },
  {
    id: 'canon',
    name: 'Canon (Pachelbel)',
    mode: 'major',
    chords: [c('I', MAJ, 0, 'maj'), c('V', MAJ, 4, 'maj'), c('vi', MAJ, 5, 'min'), c('iii', MAJ, 2, 'min'), c('IV', MAJ, 3, 'maj'), c('I', MAJ, 0, 'maj'), c('IV', MAJ, 3, 'maj'), c('V', MAJ, 4, 'maj')],
  },
  {
    id: 'circle',
    name: 'Circle of fifths',
    mode: 'major',
    chords: [c('I', MAJ, 0, 'maj'), c('IV', MAJ, 3, 'maj'), c('vii°', MAJ, 6, 'dim'), c('iii', MAJ, 2, 'min'), c('vi', MAJ, 5, 'min'), c('ii', MAJ, 1, 'min'), c('V', MAJ, 4, 'maj'), c('I', MAJ, 0, 'maj')],
  },
  {
    id: 'blues',
    name: '12-bar blues',
    mode: 'major',
    chords: [
      c('I7', MAJ, 0, '7'), c('I7', MAJ, 0, '7'), c('I7', MAJ, 0, '7'), c('I7', MAJ, 0, '7'),
      c('IV7', MAJ, 3, '7'), c('IV7', MAJ, 3, '7'), c('I7', MAJ, 0, '7'), c('I7', MAJ, 0, '7'),
      c('V7', MAJ, 4, '7'), c('IV7', MAJ, 3, '7'), c('I7', MAJ, 0, '7'), c('V7', MAJ, 4, '7'),
    ],
  },
];

export function findProgression(id: string): ProgressionDef | undefined {
  return PROGRESSIONS.find((p) => p.id === id);
}

export const MAJOR_KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'] as const;
export const MINOR_KEYS = ['A', 'E', 'B', 'F#', 'C#', 'G#', 'Eb', 'Bb', 'F', 'C', 'G', 'D'] as const;

export function keysFor(mode: 'major' | 'minor'): readonly string[] {
  return mode === 'major' ? MAJOR_KEYS : MINOR_KEYS;
}

/** How the hands share a progression: right hand alone, or left-hand root below. */
export type ChordHands = 'rh' | 'lh-bass';

// ---------------------------------------------------------------------------------------
// Items (repertoire entries)

export type ChordItem =
  | { task: 'drill'; set: ChordSetId; prompt: ChordPrompt; inversions: InversionRule }
  | { task: 'progression'; progression: string; key: string; hands: ChordHands };

export function chordItemId(item: ChordItem): string {
  return item.task === 'drill'
    ? `chords/drill/${item.set}/${item.prompt}/${item.inversions}`
    : `chords/prog/${item.progression}/${item.key}/${item.hands}`;
}

export function parseChordItemId(id: string): ChordItem | null {
  const parts = id.split('/');
  if (parts[0] !== 'chords') return null;
  if (parts[1] === 'drill') {
    const [, , set, prompt, inversions] = parts;
    if (!(set in CHORD_SETS) || !['symbol', 'notation'].includes(prompt) || !['any', 'root', 'inversions'].includes(inversions)) return null;
    return { task: 'drill', set: set as ChordSetId, prompt: prompt as ChordPrompt, inversions: inversions as InversionRule };
  }
  if (parts[1] === 'prog') {
    const [, , progression, key, hands] = parts;
    const def = findProgression(progression);
    if (!def || !keysFor(def.mode).includes(key) || !['rh', 'lh-bass'].includes(hands)) return null;
    return { task: 'progression', progression, key, hands: hands as ChordHands };
  }
  return null;
}

const INVERSION_TEXT: Record<InversionRule, string> = { any: 'any voicing', root: 'root position', inversions: 'inversions' };

export function chordItemTitle(item: ChordItem): string {
  if (item.task === 'drill') {
    return `${CHORD_SETS[item.set].name} · ${item.prompt === 'symbol' ? 'from symbols' : 'from notation'} · ${INVERSION_TEXT[item.inversions]}`;
  }
  const def = findProgression(item.progression)!;
  const key = `${item.key.replace('#', '♯').replace(/b$/, '♭')} ${def.mode}`;
  return `${def.name} in ${key}${item.hands === 'lh-bass' ? ' · LH bass' : ''}`;
}
