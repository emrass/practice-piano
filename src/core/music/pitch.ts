/**
 * Pitch primitives.
 *
 * Two coordinate systems are used throughout the app:
 *  - MIDI note numbers (60 = middle C) for everything the player presses.
 *  - "Diatonic steps" (letter-space positions: step = octave * 7 + letterIndex, C4 = 28)
 *    for generation and engraving, because staff position, ledger lines and melodic
 *    step/skip/leap are all naturally expressed in letter space.
 */

export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

export const LETTER_PC: Readonly<Record<Letter, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

export interface SpelledPitch {
  letter: Letter;
  /** -2 … +2 (double flat … double sharp) */
  alter: number;
  octave: number;
  midi: number;
}

export const MIDDLE_C = 60;
export const MIDDLE_C_STEP = 28;

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export function pitchClass(midi: number): number {
  return mod(midi, 12);
}

export function spelledToMidi(letter: Letter, alter: number, octave: number): number {
  return (octave + 1) * 12 + LETTER_PC[letter] + alter;
}

export function makePitch(letter: Letter, alter: number, octave: number): SpelledPitch {
  return { letter, alter, octave, midi: spelledToMidi(letter, alter, octave) };
}

export function stepToLetter(step: number): Letter {
  return LETTERS[mod(step, 7)];
}

export function stepToOctave(step: number): number {
  return Math.floor(step / 7);
}

export function letterOctaveToStep(letter: Letter, octave: number): number {
  return octave * 7 + LETTERS.indexOf(letter);
}

export function pitchToStep(p: Pick<SpelledPitch, 'letter' | 'octave'>): number {
  return letterOctaveToStep(p.letter, p.octave);
}

/** Natural (unaltered) MIDI number of a diatonic step. */
export function stepToNaturalMidi(step: number): number {
  return spelledToMidi(stepToLetter(step), 0, stepToOctave(step));
}

/** Closest diatonic step whose natural pitch is <= midi. */
export function midiToStepFloor(midi: number): number {
  const pc = pitchClass(midi);
  const octave = Math.floor(midi / 12) - 1;
  let letterIndex = 0;
  for (let i = 0; i < 7; i++) {
    if (LETTER_PC[LETTERS[i]] <= pc) letterIndex = i;
  }
  return octave * 7 + letterIndex;
}

const ACCIDENTAL_ASCII: Record<string, string> = {
  '-2': 'bb',
  '-1': 'b',
  '0': '',
  '1': '#',
  '2': '##',
};

const ACCIDENTAL_UNICODE: Record<string, string> = {
  '-2': '𝄫',
  '-1': '♭',
  '0': '',
  '1': '♯',
  '2': '𝄪',
};

export function accidentalText(alter: number, unicode = true): string {
  return (unicode ? ACCIDENTAL_UNICODE : ACCIDENTAL_ASCII)[String(alter)] ?? '';
}

/** "C♯" or "C♯4" */
export function pitchLabel(p: Pick<SpelledPitch, 'letter' | 'alter' | 'octave'>, withOctave = false): string {
  return `${p.letter}${accidentalText(p.alter)}${withOctave ? p.octave : ''}`;
}

/** VexFlow key string, e.g. "c#/4". */
export function vexKey(p: Pick<SpelledPitch, 'letter' | 'alter' | 'octave'>): string {
  return `${p.letter.toLowerCase()}${ACCIDENTAL_ASCII[String(p.alter)] ?? ''}/${p.octave}`;
}

/**
 * Spell an arbitrary MIDI number, preferring sharps or flats.
 * Used for things that have no musical context (keyboard labels, wrong notes).
 */
export function spellMidi(midi: number, preferFlats = false): SpelledPitch {
  const pc = pitchClass(midi);
  const octave = Math.floor(midi / 12) - 1;
  const naturals = LETTERS.find((l) => LETTER_PC[l] === pc);
  if (naturals) return makePitch(naturals, 0, octave);
  if (preferFlats) {
    const letter = LETTERS.find((l) => mod(LETTER_PC[l] - 1, 12) === pc)!;
    // Cb never occurs here because B is natural; octave is unchanged for black keys.
    return makePitch(letter, -1, octave);
  }
  const letter = LETTERS.find((l) => mod(LETTER_PC[l] + 1, 12) === pc)!;
  return makePitch(letter, 1, octave);
}

export function midiLabel(midi: number, preferFlats = false, withOctave = true): string {
  return pitchLabel(spellMidi(midi, preferFlats), withOctave);
}
