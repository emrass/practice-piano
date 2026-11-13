import { buildSteps, fingerprint, type Exercise, type Hand, type Measure, type NoteEvent } from '../exercise';
import { interpolate } from '../generator/difficulty';
import { barRhythmCells, figureKey, type RhythmCell, type RhythmOptions } from '../generator/rhythm';
import { Rng } from '../generator/rng';
import { clampLevel, type Tier } from '../generator/tiers';
import { getKey } from '../music/keys';
import { spellMidi } from '../music/pitch';
import { TIME_SIGNATURES, type TimeSignature, type TimeSignatureId } from '../music/rhythm';
import { rhythmTierForLevel } from './tiers';

/**
 * Rhythm mode (docs/DIDACTICS.md §4.3): rhythms without pitch, played on one designated key per
 * hand. Three tasks — Read, Echo (call and response) and Pulse (silent metronome bars) — and, with
 * both hands, one independence texture per exercise.
 */
export type RhythmTask = 'read' | 'echo' | 'pulse';
export type RhythmHands = 'rh' | 'lh' | 'both';
export type RhythmTexture = 'unison' | 'lh-pulse' | 'rh-pulse' | 'interlock' | 'poly3:2' | 'poly4:3';

export const RHYTHM_TEXTURES: readonly RhythmTexture[] = ['unison', 'lh-pulse', 'rh-pulse', 'interlock', 'poly3:2', 'poly4:3'];

export const TEXTURE_INFO: Readonly<Record<RhythmTexture, { name: string; help: string; minLevel: number }>> = {
  unison: { name: 'Unison', help: 'Both hands play the same rhythm.', minLevel: 1 },
  'lh-pulse': { name: 'LH pulse', help: 'Left hand keeps the beat, right hand plays the rhythm.', minLevel: 9 },
  'rh-pulse': { name: 'RH pulse', help: 'Right hand keeps the beat, left hand plays the rhythm.', minLevel: 27 },
  interlock: { name: 'Interlocking', help: 'The hands fill each other’s gaps.', minLevel: 47 },
  'poly3:2': { name: '3 against 2', help: 'Quarters against dotted quarters (3/4).', minLevel: 92 },
  'poly4:3': { name: '4 against 3', help: 'Dotted eighths against quarters (3/4).', minLevel: 96 },
};

export const TASK_INFO: Readonly<Record<RhythmTask, { name: string; help: string }>> = {
  read: { name: 'Read', help: 'Read the rhythm and play it with the metronome.' },
  echo: { name: 'Echo', help: 'Listen to a bar, then play it back in the next bar.' },
  pulse: { name: 'Pulse', help: 'The metronome falls silent — keep the tempo yourself.' },
};

export interface RhythmSettings {
  level: number;
  task: RhythmTask;
  hands: RhythmHands;
  texture: 'auto' | RhythmTexture;
  bars: number;
  timeSignature: 'auto' | TimeSignatureId;
  /** null = from level. Beats per minute (dotted quarters in 6/8). */
  bpm: number | null;
  rhKey: number;
  lhKey: number;
  /** Weak-spot practice: figures to feature. */
  focusFigures?: string[];
}

export interface RhythmInfo {
  task: RhythmTask;
  hands: RhythmHands;
  texture: RhythmTexture | null;
  rhKey: number;
  lhKey: number;
  /** Echo: bars per call (and per response). */
  echoBars: number;
  /** Echo: bars the app plays (not judged). */
  callBars: number[];
  /** Pulse: bars in which the metronome is silent. */
  mutedBars: number[];
}

export interface RhythmExercise extends Exercise {
  rhythm: RhythmInfo;
}

export function isRhythmExercise(ex: Exercise): ex is RhythmExercise {
  return 'rhythm' in ex;
}

/** Level at which each figure (and start beat, where it matters) enters the curriculum. */
const FIGURE_INTRO: Readonly<Record<string, number>> = {
  '4': 1,
  '8': 1,
  '16': 3,
  '12': 5,
  '-4': 9,
  '2,2': 17,
  '2,2,2,2': 20,
  '4,2,2': 22,
  '2,2,4': 22,
  '-2,2': 27,
  '2,-2': 29,
  '6,2': 37,
  '2,4,2': 47,
  '1,1,1,1': 57,
  '2,1,1': 59,
  '1,1,2': 61,
  // 6/8
  '6': 67,
  '4,2': 67,
  '2,2,2': 67,
  '2,4': 69,
  '-2,2,2': 69,
  '3,1,2': 72,
  '1,1,2,2': 72,
  '2,1,1,2': 72,
  '3,1': 75,
  '1,2,1': 78,
};

/** Figures are featured (weighted up) for this many levels after they are introduced. */
const FEATURE_SPAN = 8;

export function figureIntroLevel(figure: string, beat = 0, ts?: TimeSignature): number {
  const base = FIGURE_INTRO[figure] ?? 101;
  // A half or dotted half starting off the downbeat pulls against the meter.
  if ((figure === '8' || figure === '12') && beat % 2 === 1 && ts?.beatTicks === 4) return Math.max(base, 13);
  return base;
}

export function figureWeightFor(level: number, ts: TimeSignature): (figure: string, beat: number) => number {
  return (figure, beat) => {
    const intro = figureIntroLevel(figure, beat, ts);
    if (level < intro) return 0;
    // The newest material is the point of the band, so it shows up a lot.
    return intro > 1 && level - intro < FEATURE_SPAN ? 1.8 : 1;
  };
}

export interface RhythmProfile {
  level: number;
  tier: Tier;
  timePool: { id: TimeSignatureId; weight: number }[];
  texturePool: { texture: RhythmTexture; weight: number }[];
  /** Beats per minute by meter (beat = quarter, or dotted quarter in 6/8). */
  bpm: (ts: TimeSignature, texture: RhythmTexture | null) => number;
  echoBars: number;
  /** Pulse task: metronome bars on, then off. */
  pulse: { on: number; off: number };
  /** Pulse task: rhythms stay simple — the skill is the tempo. */
  pulseFigureLevel: number;
  complexity: number;
}

const SIMPLE_BPM = [
  [1, 72], [16, 84], [17, 76], [36, 92], [37, 80], [56, 96], [57, 72], [66, 84],
  [75, 76], [82, 88], [83, 84], [91, 100],
] as const;
const COMPOUND_BPM = [[67, 50], [74, 60], [100, 72]] as const;
const POLY_BPM = [[92, 60], [100, 76]] as const;

export function rhythmProfile(rawLevel: number): RhythmProfile {
  const level = clampLevel(rawLevel);
  const timePool: { id: TimeSignatureId; weight: number }[] = [{ id: '4/4', weight: level < 9 ? 1 : 1.5 }];
  if (level >= 9) timePool.push({ id: '3/4', weight: level <= 16 ? 1.5 : 1 });
  if (level >= 12) timePool.push({ id: '2/4', weight: 0.5 });
  if (level >= 67) timePool.push({ id: '6/8', weight: level <= 74 ? 6 : 1 });

  const texturePool: { texture: RhythmTexture; weight: number }[] = [];
  for (const texture of RHYTHM_TEXTURES) {
    const intro = TEXTURE_INFO[texture].minLevel;
    if (level < intro) continue;
    let weight = level - intro < FEATURE_SPAN * 2 && intro > 1 ? 1.6 : 1;
    if (texture === 'interlock' && level >= 83) weight = 3;
    if (texture.startsWith('poly')) weight = 2;
    texturePool.push({ texture, weight });
  }

  return {
    level,
    tier: rhythmTierForLevel(level),
    timePool,
    texturePool,
    bpm: (ts, texture) => {
      if (texture?.startsWith('poly')) return Math.round(interpolate(level, POLY_BPM));
      if (ts.beatTicks === 6) return Math.round(interpolate(level, COMPOUND_BPM));
      const capped = level >= 92 ? 91 : level;
      return Math.round(interpolate(capped, SIMPLE_BPM));
    },
    echoBars: level < 37 ? 1 : 2,
    pulse: level < 34 ? { on: 2, off: 2 } : level < 67 ? { on: 1, off: 3 } : { on: 1, off: 7 },
    pulseFigureLevel: Math.min(level, 46),
    complexity: level < 9 ? 0 : level < 17 ? 1 : level < 37 ? 2 : level < 57 ? 3 : 4,
  };
}

interface Slot {
  start: number;
  dur: number;
  rest: boolean;
  figure: string;
}

/** Split a silent span into readable rests that respect beats (and half bars in 4/4). */
export function restSlots(from: number, to: number, ts: TimeSignature, figure: string): Slot[] {
  const out: Slot[] = [];
  let pos = from;
  const beat = ts.beatTicks;
  while (pos < to) {
    const room = to - pos;
    const inBar = pos % ts.ticksPerBar;
    let d = 1;
    const candidates = ts.beatTicks === 6 ? [12, 6, 2, 1] : [16, 12, 8, 4, 2, 1];
    for (const c of candidates) {
      if (c > room || inBar + c > ts.ticksPerBar) continue;
      if (c === ts.ticksPerBar) {
        if (inBar !== 0) continue;
      } else if (c >= beat) {
        if (inBar % beat !== 0) continue;
        if (c === 12 && ts.beatTicks === 4) continue; // no dotted-half rests mid-bar
        if (c === 8 && ts.id === '4/4' && inBar % 8 !== 0) continue;
      } else if (inBar % c !== 0 || Math.floor(inBar / beat) !== Math.floor((inBar + c - 1) / beat)) {
        continue;
      }
      d = c;
      break;
    }
    out.push({ start: pos, dur: d, rest: true, figure });
    pos += d;
  }
  return out;
}

function cellsToSlots(cells: readonly RhythmCell[], barStart: number): Slot[] {
  const out: Slot[] = [];
  let pos = barStart;
  for (const cell of cells) {
    const figure = figureKey(cell);
    for (const t of cell) {
      out.push({ start: pos, dur: Math.abs(t), rest: t < 0, figure });
      pos += Math.abs(t);
    }
  }
  return out;
}

function pulseSlots(ts: TimeSignature, barStart: number, final: boolean): Slot[] {
  if (final) return [{ start: barStart, dur: ts.ticksPerBar, rest: false, figure: String(ts.ticksPerBar) }];
  const out: Slot[] = [];
  for (let b = 0; b < ts.beatsPerBar; b++) {
    out.push({ start: barStart + b * ts.beatTicks, dur: ts.beatTicks, rest: false, figure: String(ts.beatTicks) });
  }
  return out;
}

/** Distribute the notes of one rhythm between the hands so that they answer each other. */
function interlockSlots(rng: Rng, cells: readonly RhythmCell[], barStart: number, ts: TimeSignature, final: boolean): Record<Hand, Slot[]> {
  const all = cellsToSlots(cells, barStart);
  const notes = all.filter((s) => !s.rest);
  const owner: (Hand | 'both')[] = [];
  let run = 0;
  for (let i = 0; i < notes.length; i++) {
    let hand: Hand;
    if (i === 0) hand = rng.chance(0.5) ? 'rh' : 'lh';
    else {
      const prev = owner[i - 1] === 'both' ? 'rh' : (owner[i - 1] as Hand);
      const stay = run < 2 && rng.chance(0.35);
      hand = stay ? prev : prev === 'rh' ? 'lh' : 'rh';
    }
    run = i > 0 && hand === owner[i - 1] ? run + 1 : 1;
    owner.push(hand);
  }
  if (final && notes.length) owner[notes.length - 1] = 'both';
  // Both hands must take part in every bar.
  if (notes.length >= 2 && !owner.includes('lh') && !owner.includes('both')) owner[rng.int(0, notes.length - 1)] = 'lh';
  if (notes.length >= 2 && !owner.includes('rh') && !owner.includes('both')) owner[rng.int(0, notes.length - 1)] = 'rh';

  const result: Record<Hand, Slot[]> = { rh: [], lh: [] };
  for (const hand of ['rh', 'lh'] as const) {
    let pos = barStart;
    const out: Slot[] = [];
    notes.forEach((n, i) => {
      if (owner[i] !== hand && owner[i] !== 'both') return;
      if (n.start > pos) out.push(...restSlots(pos, n.start, ts, 'interlock'));
      out.push({ ...n, figure: final && owner[i] === 'both' ? n.figure : 'interlock' });
      pos = n.start + n.dur;
    });
    if (pos < barStart + ts.ticksPerBar) out.push(...restSlots(pos, barStart + ts.ticksPerBar, ts, 'interlock'));
    result[hand] = out;
  }
  return result;
}

function polySlots(texture: 'poly3:2' | 'poly4:3', fastHand: Hand, barStart: number, ts: TimeSignature, final: boolean): Record<Hand, Slot[]> {
  if (final) {
    const whole = (): Slot[] => [{ start: barStart, dur: ts.ticksPerBar, rest: false, figure: String(ts.ticksPerBar) }];
    return { rh: whole(), lh: whole() };
  }
  const [fast, slow] = texture === 'poly3:2' ? [4, 6] : [3, 4];
  const seq = (d: number): Slot[] =>
    Array.from({ length: ts.ticksPerBar / d }, (_, i) => ({ start: barStart + i * d, dur: d, rest: false, figure: texture }));
  const other: Hand = fastHand === 'rh' ? 'lh' : 'rh';
  return { [fastHand]: seq(fast), [other]: seq(slow) } as Record<Hand, Slot[]>;
}

function chooseWeighted<T>(rng: Rng, pool: readonly { weight: number }[], pick: (i: number) => T): T {
  return pick(rng.weighted(pool.map((_, i) => i), pool.map((p) => p.weight)));
}

export function resolveTexture(settings: Pick<RhythmSettings, 'hands' | 'texture' | 'timeSignature'>, profile: RhythmProfile, rng: Rng): RhythmTexture | null {
  if (settings.hands !== 'both') return null;
  if (settings.texture !== 'auto') return settings.texture;
  let pool = profile.texturePool;
  // Polyrhythms are written in 3/4; respect an explicit other meter.
  if (settings.timeSignature !== 'auto' && settings.timeSignature !== '3/4') pool = pool.filter((p) => !p.texture.startsWith('poly'));
  if (pool.length === 0) return 'unison';
  return chooseWeighted(rng, pool, (i) => pool[i].texture);
}

export function generateRhythmExercise(settings: RhythmSettings, seed: number): RhythmExercise {
  const rng = new Rng(seed);
  const profile = rhythmProfile(settings.level);
  const level = profile.level;
  const texture = resolveTexture(settings, profile, rng);
  const isPoly = texture === 'poly3:2' || texture === 'poly4:3';

  let ts: TimeSignature;
  if (isPoly) ts = TIME_SIGNATURES['3/4'];
  else if (settings.timeSignature !== 'auto') ts = TIME_SIGNATURES[settings.timeSignature];
  else ts = TIME_SIGNATURES[chooseWeighted(rng, profile.timePool, (i) => profile.timePool[i].id)];

  const bars = Math.max(2, Math.min(16, Math.round(settings.bars)));
  const task = settings.task;
  const echoBars = task === 'echo' ? Math.min(profile.echoBars, Math.floor(bars / 2)) : 0;
  const figureLevel = task === 'pulse' ? profile.pulseFigureLevel : level;
  const opts: RhythmOptions = {
    ts,
    level: figureLevel,
    complexity: 4,
    complexityOverridden: true,
    restProbability: 0.08,
    figureWeight: figureWeightFor(figureLevel, ts),
    focusFigures: settings.focusFigures?.length ? new Set(settings.focusFigures) : undefined,
  };

  const callBars: number[] = [];
  const mutedBars: number[] = [];
  if (task === 'echo') {
    for (let b = 0; b < bars; b++) if (Math.floor(b / echoBars) % 2 === 0) callBars.push(b);
  }
  if (task === 'pulse') {
    const { on } = profile.pulse;
    let off = profile.pulse.off;
    if (on + off > bars) off = Math.max(1, bars - on - 1);
    for (let b = 0; b < bars; b++) if (b % (on + off) >= on) mutedBars.push(b);
  }

  const slots: Record<Hand, Slot[][]> = { rh: [], lh: [] };
  let previous: RhythmCell[] | null = null;
  let fastHand: Hand = rng.chance(0.5) ? 'rh' : 'lh';
  for (let b = 0; b < bars; b++) {
    const barStart = b * ts.ticksPerBar;
    const responseOf = task === 'echo' && !callBars.includes(b) ? b - echoBars : -1;
    if (responseOf >= 0) {
      // The answer is the call, shifted.
      for (const hand of ['rh', 'lh'] as const) {
        slots[hand][b] = (slots[hand][responseOf] ?? []).map((s) => ({ ...s, start: s.start + echoBars * ts.ticksPerBar }));
      }
      continue;
    }
    const final = task !== 'echo' && b === bars - 1;
    const phraseStart = b === 0 || (task === 'echo' && (b === 0 || !callBars.includes(b - 1)));
    let cells: RhythmCell[];
    if (previous && !final && task !== 'echo' && b % 2 === 1 && rng.chance(0.3)) cells = previous;
    else cells = barRhythmCells(rng, opts, final ? 'final' : 'none', phraseStart);
    previous = cells;

    if (isPoly) {
      if (b % 2 === 0 && b > 0 && rng.chance(0.5)) fastHand = fastHand === 'rh' ? 'lh' : 'rh';
      const p = polySlots(texture, fastHand, barStart, ts, final);
      slots.rh[b] = p.rh;
      slots.lh[b] = p.lh;
    } else if (texture === 'interlock') {
      const p = interlockSlots(rng, cells, barStart, ts, final);
      slots.rh[b] = p.rh;
      slots.lh[b] = p.lh;
    } else if (texture === 'lh-pulse' || texture === 'rh-pulse') {
      const pulseHand: Hand = texture === 'lh-pulse' ? 'lh' : 'rh';
      const rhythmHand: Hand = pulseHand === 'lh' ? 'rh' : 'lh';
      slots[pulseHand][b] = pulseSlots(ts, barStart, final);
      slots[rhythmHand][b] = cellsToSlots(cells, barStart);
    } else {
      const s = cellsToSlots(cells, barStart);
      if (settings.hands !== 'lh') slots.rh[b] = s;
      if (settings.hands !== 'rh') slots.lh[b] = s.map((x) => ({ ...x }));
    }
  }

  const keyOf: Record<Hand, number> = { rh: settings.rhKey, lh: settings.lhKey };
  const counters: Record<Hand, number> = { rh: 0, lh: 0 };
  const measures: Measure[] = [];
  for (let b = 0; b < bars; b++) {
    const m: Measure = { index: b, startTick: b * ts.ticksPerBar, rh: [], lh: [] };
    for (const hand of ['rh', 'lh'] as const) {
      const pitch = spellMidi(keyOf[hand]);
      m[hand] = (slots[hand][b] ?? []).map(
        (s): NoteEvent => ({
          id: `${hand}-${counters[hand]++}`,
          hand,
          startTick: s.start,
          durationTicks: s.dur,
          measureIndex: b,
          pitches: s.rest ? [] : [pitch],
          figure: s.figure,
        }),
      );
    }
    measures.push(m);
  }

  const usesRh = measures.some((m) => m.rh.length > 0);
  const usesLh = measures.some((m) => m.lh.length > 0);
  const staves: Exercise['staves'] = [];
  if (usesRh) staves.push('treble');
  if (usesLh) staves.push('bass');
  const keys = [usesRh ? settings.rhKey : null, usesLh ? settings.lhKey : null].filter((k): k is number => k !== null);
  const key = getKey('C');
  const bpm = settings.bpm ?? profile.bpm(ts, texture);
  const base = { measures, key, timeSignature: ts };

  return {
    id: `r${task[0]}-${fingerprint(base)}`,
    seed,
    hands: settings.hands,
    staves,
    key,
    timeSignature: ts,
    bpm,
    bars,
    totalTicks: bars * ts.ticksPerBar,
    measures,
    steps: buildSteps(measures),
    meta: { level, tierId: profile.tier.id, rhythmComplexity: profile.complexity, maxPolyphony: 1, focusNotes: [] },
    range: { min: Math.min(...keys), max: Math.max(...keys) },
    rhythm: { task, hands: settings.hands, texture, rhKey: settings.rhKey, lhKey: settings.lhKey, echoBars, callBars, mutedBars },
  };
}

export type BeatPosition = 'downbeat' | 'beat' | 'offbeat' | 'sixteenth';

/** Metric position of an onset — a rhythm weak-spot dimension. */
export function beatPosition(tick: number, ts: TimeSignature): BeatPosition {
  const inBar = tick % ts.ticksPerBar;
  if (inBar === 0) return 'downbeat';
  if (inBar % ts.beatTicks === 0) return 'beat';
  if (inBar % 2 === 0) return 'offbeat';
  return 'sixteenth';
}

export const BEAT_POSITION_LABELS: Readonly<Record<BeatPosition, string>> = {
  downbeat: 'Downbeat',
  beat: 'On the beat',
  offbeat: 'Off-beat (“and”)',
  sixteenth: 'Sixteenth (“e”, “a”)',
};
