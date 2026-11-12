/**
 * Musical time is expressed in integer ticks: 4 ticks per quarter note (one tick = a 16th).
 */
export const TICKS_PER_QUARTER = 4;

export type TimeSignatureId = '4/4' | '3/4' | '2/4' | '6/8';

export interface TimeSignature {
  id: TimeSignatureId;
  numerator: number;
  denominator: number;
  ticksPerBar: number;
  /** Ticks per metronome beat (a quarter, or a dotted quarter in 6/8). */
  beatTicks: number;
  beatsPerBar: number;
  /** Beat value in quarter notes — 1 for x/4, 1.5 for 6/8. */
  beatInQuarters: number;
  /** Ticks where the bar is considered "strong" (downbeat + secondary accent). */
  strongTicks: number[];
  minLevel: number;
}

export const TIME_SIGNATURES: Readonly<Record<TimeSignatureId, TimeSignature>> = {
  '4/4': {
    id: '4/4',
    numerator: 4,
    denominator: 4,
    ticksPerBar: 16,
    beatTicks: 4,
    beatsPerBar: 4,
    beatInQuarters: 1,
    strongTicks: [0, 8],
    minLevel: 1,
  },
  '3/4': {
    id: '3/4',
    numerator: 3,
    denominator: 4,
    ticksPerBar: 12,
    beatTicks: 4,
    beatsPerBar: 3,
    beatInQuarters: 1,
    strongTicks: [0],
    minLevel: 16,
  },
  '2/4': {
    id: '2/4',
    numerator: 2,
    denominator: 4,
    ticksPerBar: 8,
    beatTicks: 4,
    beatsPerBar: 2,
    beatInQuarters: 1,
    strongTicks: [0],
    minLevel: 26,
  },
  '6/8': {
    id: '6/8',
    numerator: 6,
    denominator: 8,
    ticksPerBar: 12,
    beatTicks: 6,
    beatsPerBar: 2,
    beatInQuarters: 1.5,
    strongTicks: [0, 6],
    minLevel: 46,
  },
};

export const TIME_SIGNATURE_IDS = Object.keys(TIME_SIGNATURES) as TimeSignatureId[];

const DURATION_CODES: Record<number, string> = {
  16: 'w',
  12: 'hd',
  8: 'h',
  6: 'qd',
  4: 'q',
  3: '8d',
  2: '8',
  1: '16',
};

export function isSupportedDuration(ticks: number): boolean {
  return ticks in DURATION_CODES;
}

/** VexFlow duration code (without the rest suffix). */
export function durationCode(ticks: number): string {
  const code = DURATION_CODES[ticks];
  if (!code) throw new Error(`Unsupported duration: ${ticks} ticks`);
  return code;
}

export function isDotted(ticks: number): boolean {
  return ticks === 12 || ticks === 6 || ticks === 3;
}

/** Flag/beam count: 0 for quarter and longer, 1 for eighths, 2 for 16ths. */
export function beamLevel(ticks: number): number {
  if (ticks >= 4) return 0;
  if (ticks >= 2) return 1;
  return 2;
}

export function msPerTick(bpm: number, ts: TimeSignature): number {
  // bpm counts metronome beats; one beat = beatTicks ticks.
  return 60000 / bpm / ts.beatTicks;
}
