import { buildSteps, type Exercise, type Measure, type NoteEvent } from '../exercise';
import { Rng } from '../generator/rng';
import { makeKeySignature } from '../music/keys';
import { LETTER_PC, makePitch, type SpelledPitch } from '../music/pitch';
import { TIME_SIGNATURES } from '../music/rhythm';
import { parseTonic } from '../scales/catalog';
import { spellAbove } from '../scales/generator';
import {
  bassOf,
  CHORD_SETS,
  type ChordItem,
  chordItemId,
  chordItemTitle,
  type ChordQuality,
  type ChordSpec,
  chordSymbol,
  chordTones,
  findProgression,
  pcsOf,
  QUALITIES,
  rootPitch,
} from './catalog';
import { closeVoicing, smoothestVoicing } from './voicing';

const pc = (m: number) => ((m % 12) + 12) % 12;

/** One chord to play. */
export interface ChordTarget {
  index: number;
  spec: ChordSpec;
  symbol: string;
  /** Roman numeral (progressions). */
  numeral?: string;
  /** Pitch classes that must sound — no more, no fewer. */
  pcs: number[];
  /** Pitch class required as the lowest note, or null for any voicing. */
  bassPc: number | null;
  /** Suggested right-hand voicing (shown in notation and by the keyboard guide). */
  voicing: number[];
  /** Suggested left-hand bass note, when the left hand plays the root. */
  bassMidi: number | null;
}

export interface ChordInfo {
  item: ChordItem;
  itemId: string;
  title: string;
  targets: ChordTarget[];
  /** Tempo in bpm; one chord per 4/4 bar. */
  bpm: number;
}

export interface ChordExercise extends Exercise {
  chords: ChordInfo;
}

export function isChordExercise(ex: Exercise): ex is ChordExercise {
  return 'chords' in ex;
}

/** Weak-spot practice: extra weight for qualities and roots (pitch class) you miss or find slowly. */
export interface ChordFocus {
  qualities?: Partial<Record<ChordQuality, number>>;
  roots?: Partial<Record<number, number>>;
}

export interface ChordOptions {
  bpm: number;
  /** Drill length (chords). */
  count: number;
  focus?: ChordFocus;
}

/** Right-hand voicings sit around middle C; the left-hand bass in the bass staff. */
const RH_LOW = 55; // G3
const RH_HIGH = 79; // G5
const LH_LOW = 40; // E2

function withOctave(spelled: SpelledPitch, midi: number): SpelledPitch {
  const octave = Math.round((midi - spelled.alter - LETTER_PC[spelled.letter]) / 12) - 1;
  return makePitch(spelled.letter, spelled.alter, octave);
}

/** Spell a voicing with the chord's own letter names. */
function spellVoicing(spec: ChordSpec, voicing: readonly number[]): SpelledPitch[] {
  const tones = chordTones(spec.root, spec.quality);
  return voicing.map((m) => withOctave(tones.find((t) => pc(t.midi) === pc(m))!, m));
}

function drillTargets(item: Extract<ChordItem, { task: 'drill' }>, opts: ChordOptions, rng: Rng): ChordTarget[] {
  const qualities = CHORD_SETS[item.set].qualities;
  const out: ChordTarget[] = [];
  let prevKey = '';
  for (let i = 0; i < opts.count; i++) {
    let spec: ChordSpec;
    let key: string;
    let tries = 0;
    do {
      const quality = rng.weighted([...qualities], qualities.map((q) => 1 + (opts.focus?.qualities?.[q] ?? 0)));
      const roots = QUALITIES[quality].roots;
      const name = rng.weighted([...roots], roots.map((r) => 1 + (opts.focus?.roots?.[pc(rootPitch(r).midi)] ?? 0)));
      const inversion = item.inversions === 'inversions' ? rng.int(0, QUALITIES[quality].tones.length - 1) : 0;
      spec = { root: rootPitch(name), quality, inversion };
      key = `${name}${quality}${inversion}`;
    } while (key === prevKey && ++tries < 10);
    prevKey = key;
    const pcs = pcsOf(spec);
    const bass = pc(bassOf(spec).midi);
    out.push({
      index: i,
      spec,
      symbol: chordSymbol(spec),
      pcs,
      bassPc: item.inversions === 'any' ? null : bass,
      voicing: closeVoicing(pcs, bass, 57),
      bassMidi: null,
    });
  }
  return out;
}

function progressionTargets(item: Extract<ChordItem, { task: 'progression' }>): ChordTarget[] {
  const def = findProgression(item.progression)!;
  const { letter, alter } = parseTonic(item.key);
  const tonic = makePitch(letter, alter, 4);
  // Short progressions go round twice, so the turnaround back to the start is practised too.
  const chords = def.chords.length <= 4 ? [...def.chords, ...def.chords] : def.chords;
  const out: ChordTarget[] = [];
  let prev: number[] | null = null;
  chords.forEach((ch, i) => {
    const root = spellAbove(tonic, ch.root);
    const spec: ChordSpec = { root: withOctave(root, 60 + pc(root.midi)), quality: ch.quality, inversion: 0 };
    const pcs = pcsOf(spec);
    const rootPc = pc(root.midi);
    // First chord in root position near middle C; then the smoothest move each time.
    const voicing = prev ? smoothestVoicing(prev, pcs, RH_LOW, RH_HIGH) : closeVoicing(pcs, rootPc, 57);
    prev = voicing;
    out.push({
      index: i,
      spec,
      symbol: chordSymbol(spec),
      numeral: ch.numeral,
      pcs,
      bassPc: item.hands === 'lh-bass' ? rootPc : null,
      voicing,
      bassMidi: item.hands === 'lh-bass' ? LH_LOW + ((rootPc - pc(LH_LOW) + 12) % 12) : null,
    });
  });
  return out;
}

export function generateChordExercise(item: ChordItem, opts: ChordOptions, seed: number): ChordExercise {
  const rng = new Rng(seed);
  const targets = item.task === 'drill' ? drillTargets(item, opts, rng) : progressionTargets(item);
  const ts = TIME_SIGNATURES['4/4'];
  const lh = targets.some((t) => t.bassMidi !== null);
  const measures: Measure[] = targets.map((t, i) => {
    const rh: NoteEvent = {
      id: `rh-${i}`,
      hand: 'rh',
      startTick: i * ts.ticksPerBar,
      durationTicks: ts.ticksPerBar,
      measureIndex: i,
      pitches: spellVoicing(t.spec, t.voicing),
    };
    // Symbols above the staff — except when reading the notation is the exercise.
    if (!(item.task === 'drill' && item.prompt === 'notation')) rh.symbol = t.numeral ? `${t.symbol}  ${t.numeral}` : t.symbol;
    const m: Measure = { index: i, startTick: i * ts.ticksPerBar, rh: [rh], lh: [] };
    if (lh && t.bassMidi !== null) {
      m.lh.push({
        id: `lh-${i}`,
        hand: 'lh',
        startTick: i * ts.ticksPerBar,
        durationTicks: ts.ticksPerBar,
        measureIndex: i,
        pitches: [withOctave(t.spec.root, t.bassMidi)],
      });
    }
    return m;
  });
  const key =
    item.task === 'progression'
      ? (() => {
          const { letter, alter } = parseTonic(item.key);
          return makeKeySignature(letter, alter, findProgression(item.progression)!.mode);
        })()
      : makeKeySignature('C', 0, 'major');
  const midis = targets.flatMap((t) => [...t.voicing, ...(t.bassMidi !== null ? [t.bassMidi] : [])]);
  const id = chordItemId(item);
  return {
    id: item.task === 'drill' ? `ch-${id}-${seed}` : `ch-${id}`,
    seed,
    hands: lh ? 'both' : 'rh',
    staves: lh ? ['treble', 'bass'] : ['treble'],
    key,
    timeSignature: ts,
    bpm: Math.round(opts.bpm),
    bars: targets.length,
    totalTicks: targets.length * ts.ticksPerBar,
    measures,
    steps: buildSteps(measures),
    meta: { level: 1, tierId: 'ch', rhythmComplexity: 0, maxPolyphony: 4, focusNotes: [] },
    range: { min: Math.min(...midis), max: Math.max(...midis) },
    chords: { item, itemId: id, title: chordItemTitle(item), targets, bpm: Math.round(opts.bpm) },
  };
}

/** Starting tempo on the ladder: finding random chords takes longer than a known progression. */
export function initialChordBpm(item: ChordItem): number {
  return item.task === 'drill' ? 48 : 60;
}

/** Root pitch-class names for display (weak spots), flats for the black keys except F♯. */
export const PC_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;
