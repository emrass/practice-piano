import { buildSteps, fingerprint, type Exercise, type Measure, type NoteEvent } from '../exercise';
import { chordTones, progression } from '../generator/harmony';
import { Rng } from '../generator/rng';
import { clampLevel } from '../generator/tiers';
import { KEYS, type KeySignature, getKey, keyAlters, scaleDegree, stepToMidi, stepToPitch } from '../music/keys';
import { stepToLetter, type SpelledPitch } from '../music/pitch';
import { TIME_SIGNATURES } from '../music/rhythm';
import { earTierForLevel } from './tiers';
import type { Tier } from '../generator/tiers';

export type EarContent = 'melody' | 'dyads' | 'triads' | 'mixed';
export type EarReference = 'auto' | 'first-note' | 'key-only';

export interface EarProfile {
  level: number;
  tier: Tier;
  length: number;
  /** Diatonic range relative to the tonic (0 = tonic, 7 = octave above). */
  degreeRange: [number, number];
  maxLeap: number;
  weights: { repeat: number; step: number; skip: number; leap: number };
  keyPool: KeySignature[];
  content: EarContent;
  chordProbability: number;
  inversions: boolean;
  sevenths: boolean;
  chromaticProbability: number;
  firstNoteGiven: boolean;
  startOnTonic: boolean;
  cadence: boolean;
  bpm: number;
}

function keysUpTo(maxAccidentals: number, minor: boolean): KeySignature[] {
  return KEYS.filter((k) => Math.abs(k.fifths) <= maxAccidentals && (minor || k.mode === 'major'));
}

export function earProfile(rawLevel: number): EarProfile {
  const level = clampLevel(rawLevel);
  const t = (level - 1) / 99;
  const base: EarProfile = {
    level,
    tier: earTierForLevel(level),
    length: 2,
    degreeRange: [0, 2],
    maxLeap: 1,
    weights: { repeat: 0.1, step: 1, skip: 0, leap: 0 },
    keyPool: [getKey('C')],
    content: 'melody',
    chordProbability: 0,
    inversions: false,
    sevenths: false,
    chromaticProbability: 0,
    firstNoteGiven: true,
    startOnTonic: level < 21,
    cadence: level >= 41,
    bpm: Math.round(76 + (level - 1) * 0.3),
  };
  if (level <= 6) return base;
  if (level <= 12) return { ...base, length: 3, degreeRange: [0, 4] };
  if (level <= 20) return { ...base, length: 4, degreeRange: [0, 4], maxLeap: 2, weights: { repeat: 0.1, step: 1, skip: 0.6, leap: 0 } };
  const melodic = { repeat: 0.08, step: 1, skip: 0.6, leap: 0.25 + 0.2 * t };
  if (level <= 30) return { ...base, length: level < 26 ? 4 : 5, degreeRange: [-1, 7], maxLeap: 4, weights: melodic };
  if (level <= 40) return { ...base, length: 5, degreeRange: [-3, 7], maxLeap: 7, weights: melodic, keyPool: keysUpTo(1, false) };
  if (level <= 50) return { ...base, length: level < 46 ? 5 : 6, degreeRange: [-3, 7], maxLeap: 7, weights: melodic, keyPool: keysUpTo(2, false) };
  if (level <= 60) return { ...base, length: 6, degreeRange: [-3, 7], maxLeap: 7, weights: melodic, keyPool: keysUpTo(2, true) };
  if (level <= 70) return { ...base, length: level < 66 ? 3 : 4, degreeRange: [-2, 5], maxLeap: 4, weights: melodic, keyPool: keysUpTo(2, true), content: 'dyads' };
  if (level <= 80) return { ...base, length: level < 76 ? 3 : 4, degreeRange: [-3, 4], maxLeap: 4, weights: melodic, keyPool: keysUpTo(3, true), content: 'triads' };
  if (level <= 90)
    return {
      ...base,
      length: level < 86 ? 6 : 7,
      degreeRange: [-3, 8],
      maxLeap: 7,
      weights: melodic,
      keyPool: keysUpTo(4, true),
      chromaticProbability: 0.12,
      firstNoteGiven: false,
      cadence: true,
    };
  return {
    ...base,
    length: level < 96 ? 6 : 8,
    degreeRange: [-3, 8],
    maxLeap: 7,
    weights: melodic,
    keyPool: keysUpTo(5, true),
    content: 'mixed',
    chordProbability: 0.3,
    inversions: true,
    sevenths: true,
    chromaticProbability: 0.15,
    firstNoteGiven: false,
    cadence: true,
  };
}

export interface EarSettings {
  level: number;
  /** 'auto' or a fixed number of notes/chords (2–8). */
  length: 'auto' | number;
  reference: EarReference;
  keyId: string;
  /** Weak-spot practice: melodic interval sizes (semitones) to feature. */
  focusIntervals?: number[];
}

export interface PlaybackEvent {
  /** ms from the start of the playback (cadence included). */
  at: number;
  dur: number;
  midis: number[];
}

export interface EarExercise extends Exercise {
  ear: {
    content: EarContent;
    firstNoteGiven: boolean;
    /** Block chords that establish the key before the phrase (may be empty). */
    cadence: number[][];
    playback: PlaybackEvent[];
    /** ms at which the phrase itself starts within the playback. */
    phraseStartMs: number;
    totalMs: number;
  };
}

interface Chosen {
  step: number;
  alter: number;
}

/** Tonic step placed so the phrase range sits comfortably around G4 on the treble staff. */
function tonicStepFor(key: KeySignature, range: [number, number]): number {
  const letter = 'CDEFGAB'.indexOf(key.tonic);
  const mid = (range[0] + range[1]) / 2;
  let best = letter + 28;
  for (const octave of [2, 3, 4, 5]) {
    const s = letter + octave * 7;
    if (Math.abs(s + mid - 32) < Math.abs(best + mid - 32)) best = s;
  }
  return best;
}

function melodyLine(rng: Rng, p: EarProfile, key: KeySignature, tonic: number, length: number, focus: Set<number>): Chosen[] {
  const lo = tonic + p.degreeRange[0];
  const hi = tonic + p.degreeRange[1];
  const midi = (s: number) => stepToMidi(key, s);
  const out: Chosen[] = [];
  let prev: number;
  if (p.startOnTonic) prev = tonic;
  else prev = rng.weighted([tonic, tonic + 2, tonic + 4, tonic - 3].filter((s) => s >= lo && s <= hi), [3, 1.5, 1.5, 1]);
  out.push({ step: prev, alter: 0 });
  let prevInterval = 0;
  for (let i = 1; i < length; i++) {
    const last = i === length - 1;
    if (last) {
      // End on the tonic (closest one within reach), so every phrase sounds finished.
      const tonics = [tonic - 7, tonic, tonic + 7].filter((s) => s >= lo && s <= hi && s !== prev && Math.abs(s - prev) <= Math.max(p.maxLeap, 4));
      if (tonics.length) {
        const s = tonics.reduce((a, b) => (Math.abs(b - prev) < Math.abs(a - prev) ? b : a));
        out.push({ step: s, alter: 0 });
        break;
      }
      if (scaleDegree(key, prev) === 0) {
        out.push({ step: prev, alter: 0 }); // already home: repeat the tonic
        break;
      }
    }
    const cands: number[] = [];
    const weights: number[] = [];
    for (let s = lo; s <= hi; s++) {
      const a = Math.abs(s - prev);
      if (a > p.maxLeap) continue;
      let w = a === 0 ? p.weights.repeat : a === 1 ? p.weights.step : a === 2 ? p.weights.skip : p.weights.leap * Math.pow(0.75, a - 3);
      if (w <= 0) continue;
      if (Math.abs(midi(s) - midi(prev)) === 6) w *= 0.1;
      if (Math.abs(prevInterval) >= 3 && Math.sign(s - prev) === Math.sign(prevInterval)) w *= 0.3;
      if (focus.has(Math.abs(midi(s) - midi(prev)))) w *= 2.5;
      if (last) w *= scaleDegree(key, s) === 0 ? 6 : [2, 4].includes(scaleDegree(key, s)) ? 1.5 : 0.3;
      if (i === length - 2 && [1, 6, 4].includes(scaleDegree(key, s))) w *= 2; // approach the final tonic
      cands.push(s);
      weights.push(w);
    }
    const s = cands.length ? rng.weighted(cands, weights) : prev;
    prevInterval = s - prev;
    out.push({ step: s, alter: 0 });
    prev = s;
  }
  // Leading tones (harmonic minor) and occasional chromatic approach notes.
  const alters = keyAlters(key.fifths);
  for (let i = 0; i < out.length - 1; i++) {
    const cur = out[i];
    const next = out[i + 1];
    const deg = scaleDegree(key, cur.step);
    if (key.mode === 'minor' && deg === 6 && next.step === cur.step + 1) cur.alter = 1;
    else if (p.chromaticProbability > 0 && i > 0 && rng.chance(p.chromaticProbability)) {
      const semis = midi(next.step) - midi(cur.step);
      const keyAlter = alters[stepToLetter(cur.step)];
      if (next.step === cur.step + 1 && semis === 2 && keyAlter < 1) cur.alter = 1;
      else if (next.step === cur.step - 1 && semis === -2 && keyAlter > -1) cur.alter = -1;
    }
  }
  return out;
}

const DYAD_INTERVALS = [2, 5, 4, 7, 3]; // 3rd, 6th, 5th, octave, 4th (diatonic steps)

function chordNotes(rng: Rng, p: EarProfile, key: KeySignature, root: number, allowSeventh: boolean): Chosen[] {
  const notes: Chosen[] = [0, 2, 4].map((d) => ({ step: root + d, alter: 0 }));
  if (allowSeventh && p.sevenths && rng.chance(0.35)) notes.push({ step: root + 6, alter: 0 });
  if (key.mode === 'minor' && scaleDegree(key, root) === 4) {
    for (const n of notes) if (scaleDegree(key, n.step) === 6) n.alter = 1; // V in harmonic minor
  }
  return notes;
}

function invert(notes: Chosen[], times: number): Chosen[] {
  const out = [...notes];
  for (let i = 0; i < times; i++) {
    const low = out.shift()!;
    out.push({ step: low.step + 7, alter: low.alter });
  }
  return out;
}

function toPitches(key: KeySignature, notes: Chosen[]): SpelledPitch[] {
  const seen = new Set<number>();
  return notes
    .map((n) => stepToPitch(key, n.step, n.alter))
    .filter((p) => (seen.has(p.midi) ? false : (seen.add(p.midi), true)))
    .sort((a, b) => a.midi - b.midi);
}

function cadenceChords(key: KeySignature, tonic: number): number[][] {
  const roots = [0, 3, 4, 0];
  return roots.map((r) => {
    let root = tonic + r;
    if (r >= 3) root -= 7; // keep IV and V below the tonic for smooth voicing
    const tones = [0, 2, 4].map((d) => {
      const step = root + d;
      const alter = key.mode === 'minor' && r === 4 && scaleDegree(key, step) === 6 ? 1 : 0;
      return stepToMidi(key, step, alter);
    });
    const bass = stepToMidi(key, tonic + r - 14);
    return [bass, ...tones];
  });
}

export function generateEarExercise(settings: EarSettings, seed: number): EarExercise {
  const profile = earProfile(settings.level);
  const rng = new Rng(seed);
  const key = settings.keyId === 'auto' ? rng.pick(profile.keyPool) : getKey(settings.keyId);
  const length = settings.length === 'auto' ? profile.length : Math.min(8, Math.max(2, Math.round(settings.length)));
  const firstNoteGiven = settings.reference === 'auto' ? profile.firstNoteGiven : settings.reference === 'first-note';
  const cadenceOn = profile.cadence || !firstNoteGiven;
  const tonic = tonicStepFor(key, profile.degreeRange);
  const focus = new Set(settings.focusIntervals ?? []);

  // Choose the material of each step.
  let steps: Chosen[][];
  if (profile.content === 'dyads') {
    const line = melodyLine(rng, { ...profile, startOnTonic: true }, key, tonic, length, focus);
    steps = line.map((n) => {
      const iv = rng.weighted(DYAD_INTERVALS, [3, 2, 2, 1, 1]);
      return [n, { step: n.step + iv, alter: 0 }];
    });
  } else if (profile.content === 'triads') {
    const roots = progression(rng, 4, false).slice(0, length);
    while (roots.length < length) roots.push(0);
    roots[roots.length - 1] = 0;
    // Roots within a fourth of the tonic so the chords stay on the staff.
    steps = roots.map((r) => chordNotes(rng, profile, key, tonic + (r > 3 ? r - 7 : r), false));
  } else {
    const line = melodyLine(rng, profile, key, tonic, length, focus);
    steps = line.map((n, i) => {
      if (profile.content !== 'mixed' || n.alter !== 0 || !(i === 0 || i === line.length - 1 || rng.chance(profile.chordProbability))) return [n];
      // Harmonise the melody note (as top voice) with a triad below it.
      const deg = scaleDegree(key, n.step);
      let root = [0, 3, 4].map((r) => n.step - ((deg - r + 7) % 7)).find((s) => chordTones(scaleDegree(key, s)).includes(deg)) ?? n.step - 7;
      if (root < tonic - 4) root += 7; // keep the harmony on the staff
      let chord = chordNotes(rng, profile, key, root, i !== line.length - 1);
      chord = chord.filter((c) => c.step <= n.step);
      if (!chord.some((c) => c.step === n.step)) chord.push(n);
      return chord;
    });
  }
  // Inversions for triad levels with inversions enabled.
  if (profile.inversions) {
    steps = steps.map((s, i) => (s.length >= 3 && i > 0 && i < steps.length - 1 && rng.chance(0.5) ? invert(s, rng.int(1, s.length - 1)) : s));
  }

  // Lay the steps out in 4/4: single notes as quarters, chords as halves, last note fills the bar.
  const ts = TIME_SIGNATURES['4/4'];
  const events: NoteEvent[] = [];
  let tick = 0;
  steps.forEach((s, i) => {
    const posInBar = tick % ts.ticksPerBar;
    let dur = s.length > 1 && posInBar + 8 <= ts.ticksPerBar ? 8 : 4;
    if (i === steps.length - 1) dur = ts.ticksPerBar - posInBar;
    events.push({
      id: `ear-${i}`,
      hand: 'rh',
      startTick: tick,
      durationTicks: dur,
      measureIndex: Math.floor(tick / ts.ticksPerBar),
      pitches: toPitches(key, s),
    });
    tick += dur;
  });
  const bars = Math.ceil(tick / ts.ticksPerBar);
  const measures: Measure[] = Array.from({ length: bars }, (_, b) => ({
    index: b,
    startTick: b * ts.ticksPerBar,
    rh: events.filter((e) => e.measureIndex === b),
    lh: [],
  }));

  // Playback timeline.
  const quarterMs = 60000 / profile.bpm;
  const cadence = cadenceOn ? cadenceChords(key, tonic) : [];
  const playback: PlaybackEvent[] = cadence.map((midis, i) => ({ at: i * 700, dur: 650, midis }));
  const phraseStartMs = cadence.length ? cadence.length * 700 + 700 : 0;
  for (const e of events) {
    const at = phraseStartMs + (e.startTick / 4) * quarterMs;
    const dur = Math.round((Math.min(e.durationTicks, 8) / 4) * quarterMs * 0.92);
    playback.push({ at, dur, midis: e.pitches.map((p) => p.midi) });
  }
  const last = playback[playback.length - 1];
  const midis = events.flatMap((e) => e.pitches.map((p) => p.midi));
  const base = { measures, key, timeSignature: ts };
  return {
    id: `ear-${fingerprint(base)}`,
    seed,
    hands: 'rh',
    staves: ['treble'],
    key,
    timeSignature: ts,
    bpm: profile.bpm,
    bars,
    totalTicks: bars * ts.ticksPerBar,
    measures,
    steps: buildSteps(measures),
    meta: {
      level: profile.level,
      tierId: profile.tier.id,
      rhythmComplexity: 0,
      maxPolyphony: Math.max(...steps.map((s) => s.length)),
      focusNotes: [],
    },
    range: { min: Math.min(...midis), max: Math.max(...midis) },
    ear: {
      content: profile.content,
      firstNoteGiven,
      cadence,
      playback,
      phraseStartMs,
      totalMs: last.at + last.dur,
    },
  };
}
