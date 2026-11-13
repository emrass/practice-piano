import { buildSteps, type Exercise, type Hand, type Measure, type NoteEvent } from '../exercise';
import { makeKeySignature } from '../music/keys';
import { letterOctaveToStep, makePitch, spellMidi, spelledToMidi, stepToLetter, stepToOctave, type SpelledPitch } from '../music/pitch';
import { isSupportedDuration, TIME_SIGNATURES, type TimeSignature } from '../music/rhythm';
import { restSlots } from '../rhythm/generator';
import {
  type Degree,
  isTriadArpeggio,
  itemId,
  itemTitle,
  type NoteValue,
  parseTonic,
  SCALE_TYPES,
  type ScaleItem,
  type ScaleTypeDef,
} from './catalog';
import { fingerNotes } from './fingering';

export interface ScaleOptions {
  octaves: number;
  noteValue: NoteValue;
  /** Notes per minute (the tempo ladder's unit, independent of the note value). */
  npm: number;
}

export interface ScaleInfo {
  item: ScaleItem;
  itemId: string;
  title: string;
  octaves: number;
  noteValue: NoteValue;
  notesPerBeat: number;
  npm: number;
  /** Fingering is printed for at least one hand. */
  hasFingering: boolean;
}

export interface ScaleExercise extends Exercise {
  scale: ScaleInfo;
}

export function isScaleExercise(ex: Exercise): ex is ScaleExercise {
  return 'scale' in ex;
}

/** Note value → ticks, and the meter: triad arpeggios fall into groups of three. */
export function meterFor(item: Pick<ScaleItem, 'type'>, noteValue: NoteValue): { ts: TimeSignature; noteTicks: number } {
  const noteTicks = noteValue === 'quarter' ? 4 : noteValue === 'eighth' ? 2 : 1;
  if (isTriadArpeggio(item.type)) return { ts: TIME_SIGNATURES[noteValue === 'quarter' ? '3/4' : '6/8'], noteTicks };
  return { ts: TIME_SIGNATURES['4/4'], noteTicks };
}

export function notesPerBeat(item: Pick<ScaleItem, 'type'>, noteValue: NoteValue): number {
  const { ts, noteTicks } = meterFor(item, noteValue);
  return ts.beatTicks / noteTicks;
}

/** First notes of a new item on the ladder: comfortable, not crawling. */
export function initialNpm(item: Pick<ScaleItem, 'type'>, noteValue: NoteValue): number {
  return Math.round(notesPerBeat(item, noteValue) * (noteValue === 'quarter' ? 72 : noteValue === 'eighth' ? 60 : 50));
}

export function bpmFor(item: Pick<ScaleItem, 'type'>, noteValue: NoteValue, npm: number): number {
  return Math.max(20, Math.round(npm / notesPerBeat(item, noteValue)));
}

interface Tone {
  pitch: SpelledPitch;
  degree: number;
  ascending: boolean;
}

/** Spell a degree above a tonic pitch (letter steps decide the name, semitones the sound). */
export function spellAbove(tonic: SpelledPitch, deg: Degree): SpelledPitch {
  const step = letterOctaveToStep(tonic.letter, tonic.octave) + deg.steps;
  const letter = stepToLetter(step);
  const octave = stepToOctave(step);
  const target = tonic.midi + deg.semis;
  return makePitch(letter, target - spelledToMidi(letter, 0, octave), octave);
}

/** Pitches for `octaves` octaves going up from the first note (top note included). */
function ascending(def: ScaleTypeDef, tonic: SpelledPitch, octaves: number, cycle: readonly Degree[], chromaticFlats: boolean): Tone[] {
  const out: Tone[] = [];
  for (let o = 0; o < octaves; o++) {
    cycle.forEach((deg, i) => {
      const shifted = { steps: deg.steps + 7 * o, semis: deg.semis + 12 * o };
      const pitch = def.id === 'chromatic' ? spellMidi(tonic.midi + shifted.semis, chromaticFlats) : spellAbove(tonic, shifted);
      out.push({ pitch, degree: i, ascending: true });
    });
  }
  const top = { steps: cycle[0].steps + 7 * octaves, semis: cycle[0].semis + 12 * octaves };
  out.push({ pitch: def.id === 'chromatic' ? spellMidi(tonic.midi + top.semis, chromaticFlats) : spellAbove(tonic, top), degree: 0, ascending: true });
  return out;
}

/** Up and back down (or, mirrored, down and back up) from the first note. */
function sequence(def: ScaleTypeDef, tonic: SpelledPitch, octaves: number, downFirst: boolean): Tone[] {
  const up = ascending(def, tonic, octaves, def.asc, false);
  const downSet = ascending(def, tonic, octaves, def.desc ?? def.asc, true).map((t) => ({ ...t, ascending: false }));
  if (!downFirst) {
    // Top note already played; come back down to the first note.
    return [...up, ...downSet.slice(0, -1).reverse()];
  }
  // Mirrored (contrary-motion left hand): start at the top of the range, go down, come back up.
  return [...downSet.slice().reverse(), ...up.slice(1)];
}

/** Octave of the first note so the passage sits well on its staff. */
function startOctave(hand: Hand, octaves: number, letter: string, contrary: boolean): number {
  const low = ['C', 'D', 'E'].includes(letter);
  if (contrary) return low ? 4 : 3;
  if (hand === 'rh') return octaves === 1 || low ? 4 : 3;
  return octaves === 1 && low ? 3 : 2;
}

function handTones(def: ScaleTypeDef, item: ScaleItem, hand: Hand, octaves: number): Tone[] {
  const { letter, alter } = parseTonic(item.tonic);
  const contrary = item.hands === 'contrary';
  // Place the *first played note* (tonic, or the arpeggio's root) in the chosen octave.
  const probe = spellAbove(makePitch(letter, alter, 4), def.asc[0]);
  const wanted = startOctave(hand, octaves, probe.letter, contrary);
  const tonic = makePitch(letter, alter, 4 + (wanted - probe.octave));
  if (contrary && hand === 'lh') {
    // The left hand starts on the same note and goes down: its range ends there.
    const bottom = makePitch(tonic.letter, tonic.alter, tonic.octave - octaves);
    return sequence(def, bottom, octaves, true);
  }
  return sequence(def, tonic, octaves, false);
}

export function generateScaleExercise(item: ScaleItem, opts: ScaleOptions): ScaleExercise {
  const def = SCALE_TYPES[item.type];
  const octaves = Math.max(1, Math.min(2, Math.round(opts.octaves)));
  const hands: Hand[] = item.hands === 'rh' ? ['rh'] : item.hands === 'lh' ? ['lh'] : ['rh', 'lh'];
  const { ts, noteTicks } = meterFor(item, opts.noteValue);
  const tones = Object.fromEntries(hands.map((h) => [h, handTones(def, item, h, octaves)])) as Partial<Record<Hand, Tone[]>>;
  const count = tones[hands[0]]!.length;

  // Last note: a whole bar, a half on beat 3, or to the end of its beat; rests fill the bar.
  const lastTick = (count - 1) * noteTicks;
  const inBar = lastTick % ts.ticksPerBar;
  const remaining = ts.ticksPerBar - inBar;
  const toBeatEnd = ts.beatTicks - (inBar % ts.beatTicks);
  let finalTicks = noteTicks;
  if (inBar === 0) finalTicks = ts.ticksPerBar;
  else if (ts.id === '4/4' && inBar === 8) finalTicks = 8;
  else if (isSupportedDuration(toBeatEnd)) finalTicks = toBeatEnd;
  const totalTicks = lastTick + remaining;
  const bars = totalTicks / ts.ticksPerBar;

  const measures: Measure[] = Array.from({ length: bars }, (_, i) => ({ index: i, startTick: i * ts.ticksPerBar, rh: [], lh: [] }));
  let hasFingering = false;
  for (const hand of hands) {
    const list = tones[hand]!;
    const fingers = fingerNotes(
      item.type,
      item.tonic,
      hand,
      list.map((t) => ({ midi: t.pitch.midi, letter: t.pitch.letter, alter: t.pitch.alter, degree: t.degree })),
    );
    if (fingers) hasFingering = true;
    list.forEach((t, i) => {
      const start = i * noteTicks;
      const dur = i === list.length - 1 ? finalTicks : noteTicks;
      const m = measures[Math.floor(start / ts.ticksPerBar)];
      const ev: NoteEvent = { id: `${hand}-${i}`, hand, startTick: start, durationTicks: dur, measureIndex: m.index, pitches: [t.pitch] };
      if (fingers) ev.fingers = [fingers[i]];
      m[hand].push(ev);
    });
    const end = lastTick + finalTicks;
    if (end < totalTicks) {
      restSlots(end, totalTicks, ts, '').forEach((r, k) => {
        measures[Math.floor(r.start / ts.ticksPerBar)][hand].push({
          id: `${hand}-r${k}`,
          hand,
          startTick: r.start,
          durationTicks: r.dur,
          measureIndex: Math.floor(r.start / ts.ticksPerBar),
          pitches: [],
        });
      });
    }
  }

  const { letter, alter } = parseTonic(item.tonic);
  const key = def.keyMode === 'none' ? makeKeySignature('C', 0, 'major') : makeKeySignature(letter, alter, def.keyMode);
  const midis = hands.flatMap((h) => tones[h]!.map((t) => t.pitch.midi));
  const npb = ts.beatTicks / noteTicks;
  const id = `sc-${itemId(item)}-${octaves}-${opts.noteValue}`;
  return {
    id,
    seed: 0,
    hands: hands.length > 1 ? 'both' : hands[0],
    staves: hands.map((h) => (h === 'rh' ? 'treble' : 'bass')),
    key,
    timeSignature: ts,
    bpm: Math.max(20, Math.round(opts.npm / npb)),
    bars,
    totalTicks,
    measures,
    steps: buildSteps(measures),
    meta: { level: 1, tierId: 'sc', rhythmComplexity: 0, maxPolyphony: 1, focusNotes: [] },
    range: { min: Math.min(...midis), max: Math.max(...midis) },
    scale: {
      item,
      itemId: itemId(item),
      title: itemTitle(item.type, item.tonic),
      octaves,
      noteValue: opts.noteValue,
      notesPerBeat: npb,
      npm: opts.npm,
      hasFingering,
    },
  };
}

const NOTE_NAME: Record<NoteValue, string> = { quarter: 'quarters', eighth: 'eighths', sixteenth: 'sixteenths' };

/** "♩ = 60 in eighths" (or "♩. = 40" in 6/8). */
export function tempoText(item: Pick<ScaleItem, 'type'>, noteValue: NoteValue, npm: number): string {
  const { ts } = meterFor(item, noteValue);
  return `${ts.beatTicks === 6 ? '♩.' : '♩'} = ${bpmFor(item, noteValue, npm)} in ${NOTE_NAME[noteValue]}`;
}

/** Notes per second, for goals ("4 notes/s"). */
export function nps(npm: number): string {
  const v = npm / 60;
  return `${Number.isInteger(v) ? v : v.toFixed(1)} notes/s`;
}
