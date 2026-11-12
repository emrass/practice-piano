import {
  buildSteps,
  fingerprint,
  type Clef,
  type Exercise,
  type Hand,
  type HandsMode,
  type Measure,
  type NoteEvent,
} from '../exercise';
import { getKey, keyAlters, type KeySignature, scaleDegree, stepToMidi, stepToPitch } from '../music/keys';
import { midiToStepFloor, stepToLetter } from '../music/pitch';
import { TIME_SIGNATURES, type TimeSignature, type TimeSignatureId } from '../music/rhythm';
import { KEYBOARD_RANGES, type KeyboardSize } from '../keyboard/range';
import { difficultyProfile, type DifficultyProfile } from './difficulty';
import { chordTones, type Degree, progression } from './harmony';
import { Rng } from './rng';
import { barRhythm, type RhythmOptions } from './rhythm';
import { clampLevel } from './tiers';

export interface FocusNote {
  midi: number;
  clef: Clef;
}

export interface GeneratorSettings {
  level: number;
  hands: HandsMode;
  bars: number;
  /** "auto" or a key id from KEYS. */
  keyId: string;
  timeSignature: 'auto' | TimeSignatureId;
  rhythmComplexity: 'auto' | number;
  maxPolyphony: 'auto' | number;
  /** null = derive from difficulty. */
  bpm: number | null;
  keyboardSize: KeyboardSize;
  /** Weak-spot practice: notes to feature more often. */
  focus?: FocusNote[];
}

interface RhythmEvent {
  bar: number;
  /** Offset within the bar in ticks. */
  start: number;
  dur: number;
  rest: boolean;
  strong: boolean;
  downbeat: boolean;
  phraseEnd: boolean;
  final: boolean;
  penultimate: boolean;
}

type Role = 'melody' | 'bass';

interface LineContext {
  rng: Rng;
  key: KeySignature;
  ts: TimeSignature;
  profile: DifficultyProfile;
  range: [number, number];
  keyboardSteps: [number, number];
  /** Lowest step a chord tone added below the melody may use. */
  chordFloor: number;
  role: Role;
  chordsAbove: boolean;
  chords: Degree[];
  focus: Set<number>;
  maxLeap: number;
  maxPolyphony: number;
  chordProbability: number;
  chromaticProbability: number;
}

interface ChosenNote {
  step: number;
  alter: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function pickKey(rng: Rng, profile: DifficultyProfile): KeySignature {
  const pool = profile.keyPool;
  const weights = pool.map((k) => (k.id === 'C' ? 1.6 : 1) + (k.minLevel >= profile.level - 15 && k.minLevel > 1 ? 1.2 : 0));
  return rng.weighted(pool, weights);
}

function pickTime(rng: Rng, profile: DifficultyProfile): TimeSignature {
  const w: Record<TimeSignatureId, number> = { '4/4': 3, '3/4': 1.6, '2/4': 1, '6/8': 1.3 };
  return rng.weighted(profile.timePool, profile.timePool.map((t) => w[t.id]));
}

/** Diatonic-step bounds that stay inside the physical keyboard (with room for accidentals). */
function keyboardStepBounds(key: KeySignature, size: KeyboardSize): [number, number] {
  const kb = KEYBOARD_RANGES[size];
  let lo = midiToStepFloor(kb.min);
  while (stepToMidi(key, lo) - 1 < kb.min) lo++;
  let hi = midiToStepFloor(kb.max) + 1;
  while (stepToMidi(key, hi) + 1 > kb.max) hi--;
  return [lo, hi];
}

function clampRange(range: [number, number], bounds: [number, number]): [number, number] {
  let [lo, hi] = range;
  lo = clamp(lo, bounds[0], bounds[1]);
  hi = clamp(hi, bounds[0], bounds[1]);
  if (lo > hi) lo = hi;
  return [lo, hi];
}

function focusSteps(key: KeySignature, focus: FocusNote[] | undefined, clef: Clef): Set<number> {
  const out = new Set<number>();
  for (const f of focus ?? []) {
    if (f.clef !== clef) continue;
    const base = midiToStepFloor(f.midi);
    const exact = [base, base + 1, base - 1].find((s) => stepToMidi(key, s) === f.midi);
    out.add(exact ?? base);
  }
  return out;
}

function handRhythm(
  rng: Rng,
  profile: DifficultyProfile,
  ts: TimeSignature,
  bars: number,
  opts: RhythmOptions,
): RhythmEvent[] {
  const events: RhythmEvent[] = [];
  let previous: number[] | null = null;
  for (let b = 0; b < bars; b++) {
    const cadence = b === bars - 1 ? 'final' : bars >= 8 && b % 4 === 3 ? 'phrase' : 'none';
    let ticks: number[];
    if (previous && cadence === 'none' && b % 2 === 1 && rng.chance(profile.motifProbability)) {
      ticks = previous; // rhythmic motif repetition
    } else {
      ticks = barRhythm(rng, opts, cadence, b === 0);
    }
    previous = ticks;
    let pos = 0;
    ticks.forEach((t, i) => {
      const dur = Math.abs(t);
      events.push({
        bar: b,
        start: pos,
        dur,
        rest: t < 0,
        strong: ts.strongTicks.includes(pos),
        downbeat: pos === 0,
        phraseEnd: cadence !== 'none' && i === ticks.length - 1,
        final: cadence === 'final' && i === ticks.length - 1,
        penultimate: false,
      });
      pos += dur;
    });
  }
  const noteIdx = events.map((e, i) => (e.rest ? -1 : i)).filter((i) => i >= 0);
  if (noteIdx.length >= 2) events[noteIdx[noteIdx.length - 2]].penultimate = true;
  return events;
}

function chooseStep(ctx: LineContext, ev: RhythmEvent, prev: number | null, prevInterval: number, runDir: number, runLen: number): number {
  const { rng, key, range, profile } = ctx;
  const [lo, hi] = range;
  if (lo === hi) return lo;
  const chord = ctx.chords[ev.bar] ?? 0;
  const tones = chordTones(chord);
  const center = (lo + hi) / 2;
  const half = Math.max(1, (hi - lo) / 2);
  const candidates: number[] = [];
  for (let s = lo; s <= hi; s++) candidates.push(s);

  const centerWeight = (s: number) => {
    const d = Math.abs(s - center) / half;
    return Math.max(0.25, 1 - 0.5 * d * d);
  };

  if (ev.final) {
    const tonics = candidates.filter((s) => scaleDegree(key, s) === 0);
    const pool = tonics.length ? tonics : candidates.filter((s) => tones.includes(scaleDegree(key, s)));
    const ref = prev ?? center;
    const best = Math.min(...pool.map((s) => Math.abs(s - ref)));
    return rng.pick(pool.filter((s) => Math.abs(s - ref) === best));
  }

  if (prev === null) {
    const weights = candidates.map((s) => {
      const deg = scaleDegree(key, s);
      if (ctx.role === 'bass') return deg === chord ? 10 : tones.includes(deg) ? 0.4 : 0.05;
      const base = deg === 0 ? 3 : deg === 2 || deg === 4 ? 1.5 : 0.15;
      return base * centerWeight(s) ** 2 * (ctx.focus.has(s) ? 2 : 1);
    });
    return rng.weighted(candidates, weights);
  }

  const { repeat, step, skip, leap } = profile.intervalWeights;
  const weights = candidates.map((s) => {
    const interval = s - prev;
    const a = Math.abs(interval);
    if (a > ctx.maxLeap) return 0;
    let w = a === 0 ? repeat : a === 1 ? step : a === 2 ? skip : leap * Math.pow(0.7, a - 3);
    if (w <= 0) return 0;
    const semis = Math.abs(stepToMidi(key, s) - stepToMidi(key, prev));
    if (semis === 6) w *= 0.08; // avoid melodic tritones
    const dir = Math.sign(interval);
    if (Math.abs(prevInterval) >= 3) {
      // Leap recovery: after a leap, move by step in the opposite direction.
      if (dir === -Math.sign(prevInterval) && a <= 2) w *= 2.5;
      else if (dir === Math.sign(prevInterval)) w *= 0.25;
    }
    if (runLen >= 4 && dir === runDir) w *= 0.35;
    const deg = scaleDegree(key, s);
    const isTone = tones.includes(deg);
    if (ctx.role === 'bass') {
      if (ev.downbeat) w *= deg === chord ? 5 : isTone ? 1.2 : 0.15;
      else if (ev.strong) w *= isTone ? 2 : 0.5;
    } else if (ev.strong) {
      w *= isTone ? 2.2 : 0.55;
    }
    if (ev.phraseEnd) w *= [4, 1, 6].includes(deg) ? 2.5 : deg === 0 ? 1.2 : 0.6;
    if (ev.penultimate) {
      const nearTonic = [s - 1, s + 1].some((n) => n >= lo && n <= hi && scaleDegree(key, n) === 0);
      w *= nearTonic ? 3 : 0.5;
    }
    if (ctx.focus.has(s)) w *= 2.6;
    return w * centerWeight(s);
  });
  if (weights.every((w) => w <= 0)) {
    // Nothing reachable within the leap limit (e.g. range just changed): move toward the range.
    return clamp(prev, lo, hi);
  }
  return rng.weighted(candidates, weights);
}

function generateLine(ctx: LineContext, events: RhythmEvent[]): (number | null)[] {
  const steps: (number | null)[] = events.map(() => null);
  const barNotes = new Map<number, number[]>();
  events.forEach((e, i) => {
    if (e.rest) return;
    const list = barNotes.get(e.bar) ?? [];
    list.push(i);
    barNotes.set(e.bar, list);
  });
  const rhythmKey = (bar: number) => events.filter((e) => e.bar === bar).map((e) => (e.rest ? -e.dur : e.dur)).join(',');
  const barIntervals = new Map<number, number[]>();

  let prev: number | null = null;
  let prevInterval = 0;
  let runDir = 0;
  let runLen = 0;
  const bars = Math.max(0, ...events.map((e) => e.bar)) + 1;
  for (let b = 0; b < bars; b++) {
    const idxs = barNotes.get(b) ?? [];
    const source =
      b >= 2 && b % 4 === 2 && rhythmKey(b) === rhythmKey(b - 2) && ctx.rng.chance(ctx.profile.motifProbability)
        ? barIntervals.get(b - 2)
        : undefined;
    const intervals: number[] = [];
    idxs.forEach((idx, j) => {
      const ev = events[idx];
      let s: number | undefined;
      if (source && j > 0 && prev !== null && !ev.final && !ev.penultimate) {
        const want: number = prev + (source[j] ?? 0);
        if (want >= ctx.range[0] && want <= ctx.range[1] && Math.abs(source[j] ?? 0) <= ctx.maxLeap) s = want;
      }
      if (s === undefined) s = chooseStep(ctx, ev, prev, prevInterval, runDir, runLen);
      const interval = prev === null ? 0 : s - prev;
      intervals.push(interval);
      const dir = Math.sign(interval);
      if (dir !== 0 && dir === runDir) runLen++;
      else if (dir !== 0) {
        runDir = dir;
        runLen = 1;
      }
      prevInterval = interval;
      prev = s;
      steps[idx] = s;
    });
    barIntervals.set(b, intervals);
  }
  return steps;
}

function nextNoteStep(steps: (number | null)[], i: number): number | null {
  for (let j = i + 1; j < steps.length; j++) if (steps[j] !== null) return steps[j];
  return null;
}

/** Add accidentals (leading tones, chromatic approach notes) and chord tones. */
function decorateLine(ctx: LineContext, events: RhythmEvent[], steps: (number | null)[]): ChosenNote[][] {
  const { rng, key, ts, profile } = ctx;
  const alters = keyAlters(key.fifths);
  const minChordDur = profile.level < 60 ? 4 : profile.level < 90 ? 2 : 1;
  return events.map((ev, i) => {
    const top = steps[i];
    if (top === null) return [];
    const chord = ctx.chords[ev.bar] ?? 0;
    const deg = scaleDegree(key, top);
    const next = nextNoteStep(steps, i);
    let alter = 0;
    const keyAlter = alters[stepToLetter(top)];
    if (key.mode === 'minor' && deg === 6) {
      // Harmonic-minor leading tone, only where it resolves upward (avoids augmented seconds).
      const toTonic = next === top + 1;
      const onDominant = chord === 4 && ev.strong && next !== null && next >= top;
      if ((toTonic || onDominant) && rng.chance(0.85)) alter = 1;
    } else if (ctx.chromaticProbability > 0 && !ev.strong && ev.dur <= ts.beatTicks && next !== null && !ev.final) {
      const semis = stepToMidi(key, next) - stepToMidi(key, top);
      if (next === top + 1 && semis === 2 && keyAlter + 1 <= 1 && rng.chance(ctx.chromaticProbability * 2)) alter = 1;
      else if (next === top - 1 && semis === -2 && keyAlter - 1 >= -1 && rng.chance(ctx.chromaticProbability)) alter = -1;
    }
    const notes: ChosenNote[] = [{ step: top, alter }];

    const wantsChord =
      ctx.maxPolyphony > 1 &&
      alter === 0 &&
      ev.dur >= minChordDur &&
      rng.chance(ctx.chordProbability * (ev.strong ? 1.4 : 0.7));
    if (wantsChord) {
      const tones = chordTones(chord);
      const extra = Math.min(ctx.maxPolyphony - 1, rng.weighted([1, 2, 3], [3, 2, 1]));
      let cands: number[];
      if (ctx.chordsAbove) {
        cands = [top + 4, top + 7, top + 2, top + 5].filter((s) => tones.includes(scaleDegree(key, s)) || s === top + 7);
        cands = cands.filter((s) => s <= ctx.range[1]);
      } else if (tones.includes(deg)) {
        cands = [];
        for (let s = top - 2; s >= top - 7; s--) if (tones.includes(scaleDegree(key, s))) cands.push(s);
      } else {
        cands = [top - 2, top - 5]; // consonant third / sixth below a passing note
      }
      cands = cands.filter((s) => s >= ctx.keyboardSteps[0] && s <= ctx.keyboardSteps[1] && s >= ctx.chordFloor);
      const allowSeconds = profile.level >= 85;
      for (const s of cands) {
        if (notes.length > extra) break;
        if (!allowSeconds && notes.some((n) => Math.abs(n.step - s) < 2)) continue;
        if (notes.some((n) => n.step === s)) continue;
        if (notes.length > 1 && !rng.chance(0.75)) continue;
        notes.push({ step: s, alter: 0 });
      }
    }
    // Harmonic-minor leading tone inside a dominant chord.
    if (key.mode === 'minor' && chord === 4) {
      for (const n of notes.slice(1)) if (scaleDegree(key, n.step) === 6) n.alter = 1;
    }
    // Keep chords playable and spelled consistently: same letter → same alteration,
    // and never wider than an octave from the line note.
    const lineMidi = stepToMidi(key, top, alter);
    return notes.filter((n, i) => {
      if (i === 0) return true;
      if (Math.abs(stepToMidi(key, n.step, n.alter) - lineMidi) > 12) return false;
      return !notes.some((o) => o !== n && (o.step - n.step) % 7 === 0 && o.alter !== n.alter);
    });
  });
}

function toNoteEvents(
  hand: Hand,
  key: KeySignature,
  ts: TimeSignature,
  events: RhythmEvent[],
  notes: ChosenNote[][],
): NoteEvent[] {
  return events.map((ev, i) => {
    const seen = new Set<number>();
    const pitches = notes[i]
      .filter((n) => (seen.has(n.step) ? false : (seen.add(n.step), true)))
      .map((n) => stepToPitch(key, n.step, n.alter))
      .sort((a, b) => a.midi - b.midi);
    return {
      id: `${hand}-${i}`,
      hand,
      startTick: ev.bar * ts.ticksPerBar + ev.start,
      durationTicks: ev.dur,
      measureIndex: ev.bar,
      pitches: ev.rest ? [] : pitches,
    };
  });
}

export function generateExercise(settings: GeneratorSettings, seed: number): Exercise {
  const level = clampLevel(settings.level);
  const profile = difficultyProfile(level);
  const rng = new Rng(seed);
  const key = settings.keyId === 'auto' ? pickKey(rng, profile) : getKey(settings.keyId);
  const ts = settings.timeSignature === 'auto' ? pickTime(rng, profile) : TIME_SIGNATURES[settings.timeSignature];
  const complexityOverridden = settings.rhythmComplexity !== 'auto';
  const complexity = complexityOverridden ? clamp(Number(settings.rhythmComplexity), 0, 4) : profile.rhythmComplexity;
  const polyOverridden = settings.maxPolyphony !== 'auto';
  const maxPolyphony = polyOverridden ? clamp(Number(settings.maxPolyphony), 1, 4) : profile.maxPolyphony;
  const chordProbability = maxPolyphony <= 1 ? 0 : polyOverridden ? Math.max(profile.chordProbability, 0.3) : profile.chordProbability;
  const bars = [4, 8, 16].includes(settings.bars) ? settings.bars : 4;
  const hands = settings.hands;
  const kbSteps = keyboardStepBounds(key, settings.keyboardSize);

  let rhRange = clampRange(profile.rhRange, kbSteps);
  let lhRange = clampRange(profile.lhRange, kbSteps);
  if (hands === 'both') {
    // Keep the hands from colliding when they play together.
    rhRange = [Math.max(rhRange[0], 27), Math.max(rhRange[1], 28)];
    lhRange = [Math.min(lhRange[0], 25), Math.min(lhRange[1], 26)];
    rhRange = clampRange(rhRange, kbSteps);
    lhRange = clampRange(lhRange, kbSteps);
  }

  const widen = (range: [number, number], focus: Set<number>): [number, number] => {
    let [lo, hi] = range;
    for (const s of focus) {
      if (s < lo && lo - s <= 3) lo = s;
      if (s > hi && s - hi <= 3) hi = s;
    }
    return clampRange([lo, hi], kbSteps);
  };
  const rhFocus = focusSteps(key, settings.focus, 'treble');
  const lhFocus = focusSteps(key, settings.focus, 'bass');
  if (hands !== 'both') {
    rhRange = widen(rhRange, rhFocus);
    lhRange = widen(lhRange, lhFocus);
  }

  const chords = progression(rng, bars, level < 10);
  const baseRhythm: RhythmOptions = {
    ts,
    level,
    complexity,
    complexityOverridden,
    restProbability: profile.restProbability,
  };

  const makeLine = (hand: Hand, accompaniment: boolean): NoteEvent[] => {
    const rhythmOpts: RhythmOptions = accompaniment
      ? { ...baseRhythm, complexity: level < 26 ? 0 : Math.max(0, complexity - 1), preferLong: true, restProbability: 0 }
      : baseRhythm;
    const events = handRhythm(rng, profile, ts, bars, rhythmOpts);
    const ctx: LineContext = {
      rng,
      key,
      ts,
      profile,
      range: hand === 'rh' ? rhRange : lhRange,
      keyboardSteps: kbSteps,
      chordFloor: (hand === 'rh' ? rhRange : lhRange)[0] - (hands === 'both' ? 0 : 3),
      role: accompaniment ? 'bass' : 'melody',
      chordsAbove: hand === 'lh',
      chords,
      focus: hand === 'rh' ? rhFocus : lhFocus,
      maxLeap: accompaniment ? Math.max(profile.maxLeap, 4) : profile.maxLeap,
      maxPolyphony,
      chordProbability: accompaniment ? chordProbability * 0.8 : chordProbability,
      chromaticProbability: accompaniment ? 0 : profile.chromaticProbability,
    };
    const steps = generateLine(ctx, events);
    const notes = decorateLine(ctx, events, steps);
    return toNoteEvents(hand, key, ts, events, notes);
  };

  let rhEvents: NoteEvent[] = hands === 'lh' ? [] : makeLine('rh', false);
  let lhEvents: NoteEvent[] = hands === 'rh' ? [] : makeLine('lh', hands === 'both');

  if (hands === 'alternating') {
    const block = profile.alternationBlock;
    const activeHand = (bar: number): Hand => (Math.floor(bar / block) % 2 === 0 ? 'rh' : 'lh');
    const restBar = (hand: Hand, bar: number): NoteEvent => ({
      id: `${hand}-rest-${bar}`,
      hand,
      startTick: bar * ts.ticksPerBar,
      durationTicks: ts.ticksPerBar,
      measureIndex: bar,
      pitches: [],
    });
    const mask = (evs: NoteEvent[], hand: Hand) => {
      const out: NoteEvent[] = [];
      for (let b = 0; b < bars; b++) {
        if (activeHand(b) === hand) out.push(...evs.filter((e) => e.measureIndex === b));
        else out.push(restBar(hand, b));
      }
      return out;
    };
    rhEvents = mask(rhEvents, 'rh');
    lhEvents = mask(lhEvents, 'lh');
  }

  const measures: Measure[] = Array.from({ length: bars }, (_, b) => ({
    index: b,
    startTick: b * ts.ticksPerBar,
    rh: rhEvents.filter((e) => e.measureIndex === b),
    lh: lhEvents.filter((e) => e.measureIndex === b),
  }));

  const midis = [...rhEvents, ...lhEvents].flatMap((e) => e.pitches.map((p) => p.midi));
  const staves: Clef[] = hands === 'rh' ? ['treble'] : hands === 'lh' ? ['bass'] : ['treble', 'bass'];
  const autoBpm = ts.id === '6/8' ? Math.round(profile.bpm * 0.62) : profile.bpm;
  const exerciseBase = { measures, key, timeSignature: ts };
  return {
    id: fingerprint(exerciseBase),
    seed,
    hands,
    staves,
    key,
    timeSignature: ts,
    bpm: settings.bpm ?? autoBpm,
    bars,
    totalTicks: bars * ts.ticksPerBar,
    measures,
    steps: buildSteps(measures),
    meta: {
      level,
      tierId: profile.tier.id,
      rhythmComplexity: complexity,
      maxPolyphony,
      focusNotes: (settings.focus ?? []).map((f) => f.midi),
    },
    range: midis.length ? { min: Math.min(...midis), max: Math.max(...midis) } : { min: 60, max: 60 },
  };
}

