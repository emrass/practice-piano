import type { TimeSignature } from '../music/rhythm';
import { RHYTHM_INTRO_LEVEL } from './difficulty';
import type { Rng } from './rng';

/** Positive = note of N ticks, negative = rest of N ticks. */
export type RhythmCell = readonly number[];

interface CellDef {
  ticks: RhythmCell;
  complexity: number;
  weight: number;
  /** Earliest level (only relevant in the beginner range). */
  minLevel?: number;
  /** Allowed start offsets within the bar, in beats. Default: any beat. */
  startBeats?: readonly number[];
}

// Simple meters (beat = quarter = 4 ticks).
const SIMPLE_CELLS: readonly CellDef[] = [
  { ticks: [4], complexity: 0, weight: 3 },
  { ticks: [8], complexity: 0, weight: 1.6, startBeats: [0, 2] },
  { ticks: [16], complexity: 0, weight: 0.8, minLevel: 2, startBeats: [0] },
  { ticks: [12], complexity: 0, weight: 0.7, minLevel: 4, startBeats: [0] },
  { ticks: [-4], complexity: 0, weight: 0.35, minLevel: 3, startBeats: [1, 3] },
  { ticks: [8], complexity: 1, weight: 0.6, startBeats: [1] },
  { ticks: [-4], complexity: 1, weight: 0.3 },
  { ticks: [12], complexity: 1, weight: 0.5, startBeats: [1] },
  { ticks: [2, 2], complexity: 2, weight: 2.2 },
  { ticks: [2, 2, 2, 2], complexity: 2, weight: 0.7, startBeats: [0, 2] },
  { ticks: [6, 2], complexity: 3, weight: 1.4, startBeats: [0, 1, 2] },
  { ticks: [-2, 2], complexity: 3, weight: 0.45 },
  { ticks: [2, -2], complexity: 3, weight: 0.3 },
  { ticks: [4, 2, 2], complexity: 3, weight: 0.7, startBeats: [0, 2] },
  { ticks: [2, 2, 4], complexity: 3, weight: 0.6, startBeats: [0, 2] },
  { ticks: [1, 1, 1, 1], complexity: 4, weight: 1.3 },
  { ticks: [2, 1, 1], complexity: 4, weight: 1.1 },
  { ticks: [1, 1, 2], complexity: 4, weight: 1.0 },
  { ticks: [3, 1], complexity: 4, weight: 0.9 },
  { ticks: [2, 4, 2], complexity: 4, weight: 0.7, startBeats: [0, 1, 2] },
  { ticks: [1, 2, 1], complexity: 4, weight: 0.4 },
];

// Compound meter 6/8 (beat = dotted quarter = 6 ticks).
const COMPOUND_CELLS: readonly CellDef[] = [
  { ticks: [6], complexity: 0, weight: 2 },
  { ticks: [4, 2], complexity: 0, weight: 2.4 },
  { ticks: [12], complexity: 0, weight: 0.6, startBeats: [0] },
  { ticks: [2, 2, 2], complexity: 2, weight: 2.4 },
  { ticks: [2, 4], complexity: 3, weight: 0.8 },
  { ticks: [-2, 2, 2], complexity: 3, weight: 0.5 },
  { ticks: [3, 1, 2], complexity: 4, weight: 1 },
  { ticks: [1, 1, 2, 2], complexity: 4, weight: 1 },
  { ticks: [2, 1, 1, 2], complexity: 4, weight: 0.8 },
];

export interface RhythmOptions {
  ts: TimeSignature;
  level: number;
  complexity: number;
  /** When true, rhythm complexity was overridden; don't ramp weights by level. */
  complexityOverridden: boolean;
  restProbability: number;
  /** Bias toward long values (accompaniment). */
  preferLong?: boolean;
  /** Weak-spot practice: figure keys (see figureKey) to feature more often. */
  focusFigures?: ReadonlySet<string>;
  /**
   * Explicit figure curriculum (Rhythm mode): weight multiplier per figure and start beat.
   * 0 excludes the figure. When set, `complexity` and the level ramp are ignored.
   */
  figureWeight?: (figure: string, beat: number) => number;
}

/**
 * A rhythm figure is one cell of the library, identified by its tick pattern ("6,2" = dotted
 * quarter + eighth). Figures are the shared rhythm vocabulary of sight reading and Rhythm mode,
 * and the unit of rhythm weak-spot statistics.
 */
export function figureKey(cell: RhythmCell): string {
  return cell.join(',');
}

const FIGURE_NAMES: Record<string, string> = {
  '4': 'Quarter note',
  '8': 'Half note',
  '12': 'Dotted half',
  '16': 'Whole note',
  '6': 'Dotted quarter (6/8 beat)',
  '2,2': 'Eighth pair',
  '2,2,2,2': 'Four eighths',
  '6,2': 'Dotted quarter + eighth',
  '-2,2': 'Off-beat eighth',
  '2,-2': 'Eighth + rest',
  '4,2,2': 'Quarter + two eighths',
  '2,2,4': 'Two eighths + quarter',
  '1,1,1,1': 'Four sixteenths',
  '2,1,1': 'Eighth + two sixteenths',
  '1,1,2': 'Two sixteenths + eighth',
  '3,1': 'Dotted eighth + sixteenth',
  '2,4,2': 'Syncopation (eighth–quarter–eighth)',
  '1,2,1': 'Sixteenth syncopation',
  '4,2': 'Quarter + eighth (6/8)',
  '2,2,2': 'Three eighths (6/8)',
  '2,4': 'Eighth + quarter (6/8)',
  '-2,2,2': 'Rest + two eighths (6/8)',
  '3,1,2': 'Dotted eighth group (6/8)',
  '1,1,2,2': 'Sixteenths + eighths (6/8)',
  '2,1,1,2': 'Eighth, sixteenths, eighth (6/8)',
  'poly3:2': 'Polyrhythm 3 against 2',
  'poly4:3': 'Polyrhythm 4 against 3',
  interlock: 'Interlocking hands',
};

export function figureName(key: string): string {
  return FIGURE_NAMES[key] ?? key;
}

function cellsFor(ts: TimeSignature): readonly CellDef[] {
  return ts.beatTicks === 6 ? COMPOUND_CELLS : SIMPLE_CELLS;
}

function cellLength(cell: RhythmCell): number {
  return cell.reduce((a, b) => a + Math.abs(b), 0);
}

function cellWeight(def: CellDef, opts: RhythmOptions, beat: number): number {
  let w = def.weight;
  if (opts.figureWeight) {
    w *= opts.figureWeight(figureKey(def.ticks), beat);
    if (opts.focusFigures?.has(figureKey(def.ticks))) w *= 3;
    return w;
  }
  if (def.complexity > 0 && def.ticks.some((t) => t < 0)) {
    // Rest-containing cells scale with the profile's rest probability.
    w *= opts.restProbability / 0.08;
  }
  if (!opts.complexityOverridden) {
    const intro = Math.max(def.minLevel ?? 0, RHYTHM_INTRO_LEVEL[def.complexity] ?? 1);
    // New figures fade in over ~12 levels so the jump between bands is gentle.
    const ramp = Math.min(1, Math.max(0.3, 0.3 + (opts.level - intro) / 12));
    w *= ramp;
  }
  if (opts.focusFigures?.has(figureKey(def.ticks))) w *= 3;
  if (opts.preferLong) {
    const notes = def.ticks.filter((t) => t > 0);
    const avg = notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : 0;
    w *= Math.pow(Math.max(avg, 0.5) / opts.ts.beatTicks, 1.6);
  }
  return w;
}

/**
 * Fill [fromTick, toTick) of a bar with rhythm cells.
 * Never produces a rest at tick 0 when `noLeadingRest` is set.
 */
export function fillRhythm(rng: Rng, opts: RhythmOptions, fromTick: number, toTick: number, noLeadingRest: boolean): number[] {
  return fillRhythmCells(rng, opts, fromTick, toTick, noLeadingRest).flat();
}

/** Like fillRhythm, but keeps the cells (figures) separate. */
export function fillRhythmCells(
  rng: Rng,
  opts: RhythmOptions,
  fromTick: number,
  toTick: number,
  noLeadingRest: boolean,
): RhythmCell[] {
  const { ts } = opts;
  const defs = opts.figureWeight
    ? cellsFor(ts)
    : cellsFor(ts).filter(
        (d) => d.complexity <= opts.complexity && (d.minLevel === undefined || opts.level >= d.minLevel || opts.complexity > 0),
      );
  const out: RhythmCell[] = [];
  let pos = fromTick;
  while (pos < toTick) {
    const beat = Math.round(pos / ts.beatTicks);
    const room = toTick - pos;
    const candidates = defs.filter((d) => {
      const len = cellLength(d.ticks);
      if (len > room) return false;
      if (d.startBeats && !d.startBeats.includes(beat)) return false;
      // 4-beat cells only fit 4/4; 3-beat cells only make sense at the start of 3/4 or 4/4.
      if (len === 16 && ts.ticksPerBar !== 16) return false;
      if (len === 12 && ts.beatTicks === 4 && ts.ticksPerBar < 12) return false;
      if (noLeadingRest && pos === 0 && out.length === 0 && d.ticks[0] < 0) return false;
      return cellWeight(d, opts, beat) > 0;
    });
    let chosen: RhythmCell;
    if (candidates.length === 0) {
      chosen = [Math.min(room, ts.beatTicks)];
    } else {
      chosen = rng.weighted(
        candidates.map((c) => c.ticks),
        candidates.map((c) => cellWeight(c, opts, beat)),
      );
    }
    out.push(chosen);
    pos += cellLength(chosen);
  }
  return out;
}

/** Long closing value for a phrase / the final bar. */
export function cadenceLength(rng: Rng, ts: TimeSignature, final: boolean, level = 100): number {
  switch (ts.id) {
    case '4/4':
      if (level < 4) return final ? rng.weighted([16, 8], [1, 1.4]) : 8;
      return final ? rng.weighted([16, 8], [1, 1.4]) : rng.weighted([8, 12], [3, 1]);
    case '3/4':
      return final ? rng.weighted([12, 8], [1.5, 1]) : 8;
    case '2/4':
      return final ? 8 : rng.weighted([8, 4], [2, 1]);
    case '6/8':
      return final ? rng.weighted([12, 6], [1.5, 1]) : 6;
  }
}

/**
 * Rhythm for one bar. `cadence` makes the bar end with a long note
 * ('final' for the end of the piece, 'phrase' for internal phrase endings).
 */
export function barRhythm(rng: Rng, opts: RhythmOptions, cadence: 'none' | 'phrase' | 'final', isFirstBar: boolean): number[] {
  return barRhythmCells(rng, opts, cadence, isFirstBar).flat();
}

/** Like barRhythm, but returns the figures (cells) the bar is made of. */
export function barRhythmCells(rng: Rng, opts: RhythmOptions, cadence: 'none' | 'phrase' | 'final', isFirstBar: boolean): RhythmCell[] {
  const { ts } = opts;
  if (cadence === 'none') return fillRhythmCells(rng, opts, 0, ts.ticksPerBar, isFirstBar);
  const last = cadenceLength(rng, ts, cadence === 'final', opts.level);
  const head = fillRhythmCells(rng, { ...opts, restProbability: 0 }, 0, ts.ticksPerBar - last, isFirstBar);
  return [...head, [last]];
}
