import { KEYS, type KeySignature } from '../music/keys';
import { TIME_SIGNATURES, TIME_SIGNATURE_IDS, type TimeSignature } from '../music/rhythm';
import { clampLevel, tierForLevel, type Tier } from './tiers';

/**
 * Everything the generator needs to know about a difficulty level (1–100).
 * Ranges are in diatonic steps (C4 = 28, see music/pitch.ts).
 */
export interface DifficultyProfile {
  level: number;
  tier: Tier;
  rhRange: [number, number];
  lhRange: [number, number];
  /** Largest melodic interval in diatonic steps (1 = step, 2 = third, 7 = octave). */
  maxLeap: number;
  intervalWeights: { repeat: number; step: number; skip: number; leap: number };
  rhythmComplexity: number;
  maxPolyphony: number;
  chordProbability: number;
  chromaticProbability: number;
  restProbability: number;
  /** Probability that a bar re-uses a previous bar's rhythm / melodic shape. */
  motifProbability: number;
  keyPool: KeySignature[];
  timePool: TimeSignature[];
  bpm: number;
  /** Bars per hand before switching in Alternating mode. */
  alternationBlock: number;
}

export const RHYTHM_COMPLEXITY_LABELS = ['Basic', 'Simple', 'Moderate', 'Syncopated', 'Complex'] as const;

/** Level at which each rhythm complexity is introduced when difficulty is "auto". */
export const RHYTHM_INTRO_LEVEL = [1, 10, 26, 46, 71] as const;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Piecewise-linear interpolation through [level, value] anchors. */
export function interpolate(level: number, anchors: readonly (readonly [number, number])[]): number {
  if (level <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) {
    const [l1, v1] = anchors[i];
    const [l0, v0] = anchors[i - 1];
    if (level <= l1) return lerp(v0, v1, (level - l0) / (l1 - l0));
  }
  return anchors[anchors.length - 1][1];
}

const RH_LO = [[16, 28], [30, 26], [45, 25], [60, 24], [80, 22], [100, 21]] as const;
const RH_HI = [[16, 35], [30, 38], [45, 40], [60, 42], [80, 44], [100, 47]] as const;
const LH_LO = [[16, 21], [30, 18], [45, 16], [60, 14], [80, 12], [100, 10]] as const;
const LH_HI = [[16, 28], [30, 27], [45, 28], [60, 30], [80, 31], [100, 33]] as const;

/** Beginner micro-progression: number of notes in the five-finger C position. */
function beginnerSpan(level: number): number {
  if (level <= 3) return 1; // C only
  if (level <= 5) return 2; // C D
  if (level <= 6) return 3; // C D E
  if (level <= 9) return 4; // C–F
  return 5; // C–G (five-finger position)
}

export function rhythmComplexityForLevel(level: number): number {
  if (level < 10) return 0;
  if (level < 26) return 1;
  if (level < 46) return 2;
  if (level < 71) return 3;
  return 4;
}

export function maxPolyphonyForLevel(level: number): number {
  if (level < 36) return 1;
  if (level < 56) return 2;
  if (level < 76) return 3;
  return 4;
}

export function maxLeapForLevel(level: number): number {
  if (level <= 6) return 1;
  if (level <= 12) return 2;
  if (level <= 20) return 3;
  if (level <= 35) return 4;
  if (level <= 55) return 5;
  if (level <= 75) return 7;
  return 9;
}

export function bpmForLevel(level: number): number {
  return Math.round(60 + (clampLevel(level) - 1) * 0.53);
}

export function difficultyProfile(rawLevel: number): DifficultyProfile {
  const level = clampLevel(rawLevel);
  let rhRange: [number, number];
  let lhRange: [number, number];
  if (level < 16) {
    const span = beginnerSpan(level);
    rhRange = [28, 28 + span - 1]; // C4 upward
    lhRange = [21, 21 + span - 1]; // C3 upward (LH C position)
  } else {
    rhRange = [Math.round(interpolate(level, RH_LO)), Math.round(interpolate(level, RH_HI))];
    lhRange = [Math.round(interpolate(level, LH_LO)), Math.round(interpolate(level, LH_HI))];
  }

  const t = (level - 1) / 99;
  return {
    level,
    tier: tierForLevel(level),
    rhRange,
    lhRange,
    maxLeap: maxLeapForLevel(level),
    intervalWeights: {
      repeat: level < 10 ? 0.55 : lerp(0.28, 0.12, t),
      step: 1,
      skip: level < 7 ? 0 : lerp(0.38, 0.6, t),
      leap: level < 13 ? 0 : lerp(0.14, 0.4, t),
    },
    rhythmComplexity: rhythmComplexityForLevel(level),
    maxPolyphony: maxPolyphonyForLevel(level),
    chordProbability: level < 36 ? 0 : lerp(0.14, 0.45, (level - 36) / 64),
    chromaticProbability: level < 61 ? 0 : lerp(0.05, 0.14, (level - 61) / 39),
    restProbability: level < 13 ? 0 : lerp(0.05, 0.12, t),
    motifProbability: level < 4 ? 0 : lerp(0.5, 0.3, t),
    keyPool: KEYS.filter((k) => k.minLevel <= level),
    timePool: TIME_SIGNATURE_IDS.map((id) => TIME_SIGNATURES[id]).filter((ts) => ts.minLevel <= level),
    bpm: bpmForLevel(level),
    alternationBlock: level < 16 ? 2 : 1,
  };
}
