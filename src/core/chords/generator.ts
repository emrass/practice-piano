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
  drillHandsOf,
  findProgression,
  inversionsOf,
  progressionHandsOf,
  pcsOf,
  QUALITIES,
  rootPitch,
  sequenceHandsOf,
} from './catalog';
import { closeVoicing, smoothestVoicing } from './voicing';

const pc = (m: number) => ((m % 12) + 12) % 12;

/** One chord to play. */
export interface ChordTarget {
  index: number;
  /** When the chord is due, in ticks from the start: every bar, or every half bar in a sequence. */
  tick: number;
  /** Sequences: on the way up, the turn at the top, or on the way back down. */
  leg?: 'up' | 'top' | 'down';
  spec: ChordSpec;
  symbol: string;
  /** Roman numeral (progressions). */
  numeral?: string;
  /** Pitch classes that must sound — no more, no fewer. */
  pcs: number[];
  /** Pitch class required as the lowest note, or null for any voicing. */
  bassPc: number | null;
  /**
   * Suggested voicing (shown in notation and by the keyboard guide): the right hand's, or in a
   * left-hand drill the left hand's.
   */
  voicing: number[];
  /** Suggested left-hand bass note under the right hand (progressions with the LH root, LH-bass drills). */
  bassMidi: number | null;
  /** Hands-together drills: the left hand's chord on the bass staff, an octave below the right hand's. */
  lhChord: number[] | null;
  /**
   * Read from the staff: the written keys, low to high, and exactly these count (octave and all).
   * null = read from a symbol: the pitch classes in any octave, with any hand.
   */
  written: number[] | null;
}

export interface ChordInfo {
  item: ChordItem;
  itemId: string;
  title: string;
  targets: ChordTarget[];
  /** Tempo in bpm (quarter notes). */
  bpm: number;
  /** Beats from one chord to the next: 4 (one chord per 4/4 bar), or 2 in a sequence (half notes). */
  beatsPerChord: 2 | 4;
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
  /** The player's keyboard (lowest and highest key): a sequence is placed to fit it. Default: 61 keys. */
  keyboard?: { min: number; max: number };
}

const BAR_TICKS = TIME_SIGNATURES['4/4'].ticksPerBar;
const HALF_TICKS = BAR_TICKS / 2;

/** Right-hand voicings sit around middle C; the left-hand bass in the bass staff. */
const RH_LOW = 55; // G3
const RH_HIGH = 79; // G5
const LH_LOW = 40; // E2
/** Left-hand drill chords start from F2, so even a seventh stays within a ledger line of the bass staff. */
const LH_CHORD_LOW = 41; // F2
/**
 * Hands together: the left hand's chord starts from G2 and the right hand plays it an octave
 * higher, so neither hand goes far past the ledger lines of its single-hand drill.
 */
const BOTH_LH_LOW = 43; // G2
/** Close voicings in the right hand start from A3, around middle C. */
const RH_START = 57; // A3

/** The bass note below the right hand, in the bass staff (E2 to E♭3). */
const bassNote = (bassPc: number) => LH_LOW + ((bassPc - pc(LH_LOW) + 12) % 12);

/** The keys written on the staff, low to high. */
const writtenKeys = (voicing: readonly number[], bassMidi: number | null, lhChord: readonly number[] | null = null) =>
  [...(lhChord ?? []), ...(bassMidi !== null ? [bassMidi] : []), ...voicing].sort((a, b) => a - b);

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
  const hands = drillHandsOf(item.prompt, item.drillHands);
  const rule = inversionsOf(item.prompt, item.inversions);
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
      const inversion = rule === 'inversions' ? rng.int(0, QUALITIES[quality].tones.length - 1) : 0;
      spec = { root: rootPitch(name), quality, inversion };
      key = `${name}${quality}${inversion}`;
    } while (key === prevKey && ++tries < 10);
    prevKey = key;
    const pcs = pcsOf(spec);
    const bass = pc(bassOf(spec).midi);
    // LH bass: the bass note (the root, or the inversion's bass) on the bass staff, the whole chord
    // in close root position above it in the right hand (C/G: G under C–E–G). Both: the same
    // voicing in each hand, an octave apart. Read from notation, exactly the written keys count.
    const lhChord = hands === 'both' ? closeVoicing(pcs, bass, BOTH_LH_LOW) : null;
    const voicing =
      hands === 'lh-bass'
        ? closeVoicing(pcs, pc(spec.root.midi), RH_START)
        : lhChord
          ? lhChord.map((k) => k + 12)
          : closeVoicing(pcs, bass, hands === 'lh' ? LH_CHORD_LOW : RH_START);
    const bassMidi = hands === 'lh-bass' ? bassNote(bass) : null;
    out.push({
      index: i,
      tick: i * BAR_TICKS,
      spec,
      symbol: chordSymbol(spec),
      pcs,
      bassPc: rule === 'any' ? null : bass,
      voicing,
      bassMidi,
      lhChord,
      written: item.prompt === 'notation' ? writtenKeys(voicing, bassMidi, lhChord) : null,
    });
  }
  return out;
}

function progressionTargets(item: Extract<ChordItem, { task: 'progression' }>): ChordTarget[] {
  const def = findProgression(item.progression)!;
  const { letter, alter } = parseTonic(item.key);
  const tonic = makePitch(letter, alter, 4);
  // Short progressions go around twice, so the turnaround back to the start is practiced too.
  const chords = def.chords.length <= 4 ? [...def.chords, ...def.chords] : def.chords;
  const hands = progressionHandsOf(item.notation, item.hands);
  const out: ChordTarget[] = [];
  let prev: number[] | null = null;
  chords.forEach((ch, i) => {
    const root = spellAbove(tonic, ch.root);
    const spec: ChordSpec = { root: withOctave(root, 60 + pc(root.midi)), quality: ch.quality, inversion: 0 };
    const pcs = pcsOf(spec);
    const rootPc = pc(root.midi);
    // First chord in root position near middle C; then the smoothest move each time.
    const voicing = prev ? smoothestVoicing(prev, pcs, RH_LOW, RH_HIGH) : closeVoicing(pcs, rootPc, RH_START);
    prev = voicing;
    const bassMidi = hands === 'lh-bass' ? bassNote(rootPc) : null;
    out.push({
      index: i,
      tick: i * BAR_TICKS,
      spec,
      symbol: chordSymbol(spec),
      numeral: ch.numeral,
      pcs,
      bassPc: hands === 'lh-bass' ? rootPc : null,
      voicing,
      bassMidi,
      lhChord: null,
      written: item.notation ? writtenKeys(voicing, bassMidi) : null,
    });
  });
  return out;
}

// ---------------------------------------------------------------------------------------
// Inversions in sequence

/** Ledger lines a written pitch needs on its staff. */
export function ledgerLines(p: SpelledPitch, clef: 'treble' | 'bass'): number {
  const step = p.octave * 7 + 'CDEFGAB'.indexOf(p.letter);
  const [low, high] = clef === 'treble' ? [30, 38] : [18, 26]; // staff lines: E4 to F5, G2 to A3
  return step < low ? Math.floor((low - step) / 2) : step > high ? Math.floor((step - high) / 2) : 0;
}

/**
 * Where a hand starts its sequence: the root from which the whole way up (root position to root
 * position an octave higher, `span` semitones in all) fits the keyboard and needs the fewest
 * ledger lines. The left hand may take up to three ledger lines above the bass staff when that
 * keeps the chords out of the muddy octave below C3.
 */
function sequenceStart(spec: ChordSpec, span: number, clef: 'treble' | 'bass', keyboard: { min: number; max: number }): number {
  const rootPc = pc(spec.root.midi);
  let best = 60 + rootPc;
  let bestCost = Infinity;
  for (let octave = 1; octave <= 6; octave++) {
    const root = 12 * (octave + 1) + rootPc;
    if (root < keyboard.min || root + span > keyboard.max) continue;
    const [low, high] = spellVoicing(spec, [root, root + span]);
    const worst = Math.max(ledgerLines(low, clef), ledgerLines(high, clef));
    const cost = clef === 'bass' ? (worst <= 3 && root >= 48 ? 0 : 1 + worst) : worst;
    if (cost < bestCost) {
      best = root;
      bestCost = cost;
    }
  }
  return best;
}

/**
 * Standard fingering of a solid triad per inversion, low key to high: the middle finger changes
 * where the wider gap is (right hand 1-2-5 in first inversion, left hand 5-2-1 in second).
 */
const TRIAD_FINGERS: Record<'rh' | 'lh', readonly number[][]> = {
  rh: [[1, 3, 5], [1, 2, 5], [1, 3, 5]],
  lh: [[5, 3, 1], [5, 3, 1], [5, 2, 1]],
};

const DEFAULT_KEYBOARD = { min: 36, max: 96 };

/**
 * One chord through its inversions, up one octave and back: solid half-note chords in 4/4, the
 * last one a whole note (a triad: 7 chords in 4 bars). Hands together play the same shape an
 * octave or two apart, each hand where it reads best.
 */
function generateSequenceExercise(item: Extract<ChordItem, { task: 'sequence' }>, opts: ChordOptions, seed: number): ChordExercise {
  const ts = TIME_SIGNATURES['4/4'];
  const keyboard = opts.keyboard ?? DEFAULT_KEYBOARD;
  const root = rootPitch(item.key);
  const semis = QUALITIES[item.chord].tones.map((t) => t.semis);
  const n = semis.length;
  const span = 12 + semis[n - 1];
  const played = sequenceHandsOf(item.notation, item.hands);
  const hands: ('rh' | 'lh')[] = played === 'both' ? ['rh', 'lh'] : [played];
  const rootPosition: ChordSpec = { root, quality: item.chord, inversion: 0 };
  const start = { rh: sequenceStart(rootPosition, span, 'treble', keyboard), lh: sequenceStart(rootPosition, span, 'bass', keyboard) };
  // Position 0 is root position, 1 the first inversion … n root position again, an octave up.
  const keysAt = (hand: 'rh' | 'lh', position: number) =>
    Array.from({ length: n }, (_, k) => start[hand] + semis[(position + k) % n] + 12 * Math.floor((position + k) / n));
  const up = Array.from({ length: n + 1 }, (_, i) => i);
  const positions = [...up, ...up.slice(0, -1).reverse()];
  const targets: ChordTarget[] = positions.map((position, i) => {
    const spec: ChordSpec = { root, quality: item.chord, inversion: position % n };
    const voicing = keysAt(hands[0], position);
    const lhChord = played === 'both' ? keysAt('lh', position) : null;
    return {
      index: i,
      tick: i * HALF_TICKS,
      leg: i < n ? 'up' : i === n ? 'top' : 'down',
      spec,
      symbol: chordSymbol(spec),
      pcs: pcsOf(spec),
      bassPc: pc(bassOf(spec).midi),
      voicing,
      bassMidi: null,
      lhChord,
      written: item.notation ? writtenKeys(voicing, null, lhChord) : null,
    };
  });
  // The last chord is held for a whole bar.
  const bars = Math.ceil((targets.length + 1) / 2);
  const measures: Measure[] = Array.from({ length: bars }, (_, i) => ({ index: i, startTick: i * ts.ticksPerBar, rh: [], lh: [] }));
  targets.forEach((t, i) => {
    const measure = measures[Math.floor(t.tick / ts.ticksPerBar)];
    for (const hand of hands) {
      const event: NoteEvent = {
        id: `${hand}-${i}`,
        hand,
        startTick: t.tick,
        durationTicks: i === targets.length - 1 ? ts.ticksPerBar : HALF_TICKS,
        measureIndex: measure.index,
        pitches: spellVoicing(t.spec, hand === 'lh' && t.lhChord ? t.lhChord : t.voicing),
        fingers: [...TRIAD_FINGERS[hand][t.spec.inversion]],
      };
      // The slash chords name the inversions: above the top staff, also when the notes are written.
      if (hand === hands[0]) event.symbol = t.symbol;
      measure[hand].push(event);
    }
  });
  const { letter, alter } = parseTonic(item.key);
  const midis = targets.flatMap((t) => [...t.voicing, ...(t.lhChord ?? [])]);
  const id = chordItemId(item);
  return {
    id: `ch-${id}`,
    seed,
    hands: played,
    staves: played === 'both' ? ['treble', 'bass'] : played === 'lh' ? ['bass'] : ['treble'],
    key: makeKeySignature(letter, alter, item.chord === 'min' ? 'minor' : 'major'),
    timeSignature: ts,
    bpm: Math.round(opts.bpm),
    bars,
    totalTicks: bars * ts.ticksPerBar,
    measures,
    steps: buildSteps(measures),
    meta: { level: 1, tierId: 'ch', rhythmComplexity: 0, maxPolyphony: n, focusNotes: [] },
    range: { min: Math.min(...midis), max: Math.max(...midis) },
    chords: { item, itemId: id, title: chordItemTitle(item), targets, bpm: Math.round(opts.bpm), beatsPerChord: 2 },
  };
}

export function generateChordExercise(item: ChordItem, opts: ChordOptions, seed: number): ChordExercise {
  if (item.task === 'sequence') return generateSequenceExercise(item, opts, seed);
  const rng = new Rng(seed);
  const targets = item.task === 'drill' ? drillTargets(item, opts, rng) : progressionTargets(item);
  const ts = TIME_SIGNATURES['4/4'];
  // A left-hand drill writes the whole chord on the bass staff; otherwise the voicing is the right hand's.
  const lhOnly = item.task === 'drill' && drillHandsOf(item.prompt, item.drillHands) === 'lh';
  const lh = targets.some((t) => t.bassMidi !== null || t.lhChord !== null);
  const measures: Measure[] = targets.map((t, i) => {
    const hand = lhOnly ? 'lh' : 'rh';
    const chord: NoteEvent = {
      id: `${hand}-${i}`,
      hand,
      startTick: i * ts.ticksPerBar,
      durationTicks: ts.ticksPerBar,
      measureIndex: i,
      pitches: spellVoicing(t.spec, t.voicing),
    };
    // Symbols above the staff, except when reading the notation is the exercise.
    if (!(item.task === 'drill' && item.prompt === 'notation')) chord.symbol = t.numeral ? `${t.symbol}  ${t.numeral}` : t.symbol;
    const m: Measure = { index: i, startTick: i * ts.ticksPerBar, rh: lhOnly ? [] : [chord], lh: lhOnly ? [chord] : [] };
    const lhKeys = t.lhChord ?? (t.bassMidi !== null ? [t.bassMidi] : null);
    if (lh && lhKeys) {
      m.lh.push({
        id: `lh-${i}`,
        hand: 'lh',
        startTick: i * ts.ticksPerBar,
        durationTicks: ts.ticksPerBar,
        measureIndex: i,
        pitches: spellVoicing(t.spec, lhKeys),
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
  const midis = targets.flatMap((t) => [...t.voicing, ...(t.bassMidi !== null ? [t.bassMidi] : []), ...(t.lhChord ?? [])]);
  const id = chordItemId(item);
  return {
    id: item.task === 'drill' ? `ch-${id}-${seed}` : `ch-${id}`,
    seed,
    hands: lhOnly ? 'lh' : lh ? 'both' : 'rh',
    staves: lhOnly ? ['bass'] : lh ? ['treble', 'bass'] : ['treble'],
    key,
    timeSignature: ts,
    bpm: Math.round(opts.bpm),
    bars: targets.length,
    totalTicks: targets.length * ts.ticksPerBar,
    measures,
    steps: buildSteps(measures),
    meta: { level: 1, tierId: 'ch', rhythmComplexity: 0, maxPolyphony: 4, focusNotes: [] },
    range: { min: Math.min(...midis), max: Math.max(...midis) },
    chords: { item, itemId: id, title: chordItemTitle(item), targets, bpm: Math.round(opts.bpm), beatsPerChord: 4 },
  };
}

/** Starting tempo on the ladder: finding random chords takes longer than a known progression or sequence. */
export function initialChordBpm(item: ChordItem): number {
  return item.task === 'drill' ? 48 : 60;
}

/** Root pitch-class names for display (weak spots), flats for the black keys except F♯. */
export const PC_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const;
