import type { SpelledPitch } from './music/pitch';
import type { KeySignature } from './music/keys';
import type { TimeSignature } from './music/rhythm';

export type Hand = 'rh' | 'lh';
export type Clef = 'treble' | 'bass';
export type HandsMode = 'rh' | 'lh' | 'alternating' | 'both';

export const HAND_CLEF: Readonly<Record<Hand, Clef>> = { rh: 'treble', lh: 'bass' };

/** One rhythmic event on one staff: a note, a chord or a rest. */
export interface NoteEvent {
  /** Unique within the exercise, e.g. "rh-12". */
  id: string;
  hand: Hand;
  /** Absolute start in ticks from the beginning of bar 1. */
  startTick: number;
  durationTicks: number;
  measureIndex: number;
  /** Empty for rests. Sorted low → high. */
  pitches: SpelledPitch[];
  /** Rhythm figure this event belongs to (see generator/rhythm.ts figureKey). */
  figure?: string;
  /** Suggested fingering per pitch (scales & arpeggios). */
  fingers?: number[];
  /** Chord symbol printed above the staff (chords & progressions). */
  symbol?: string;
}

export interface Measure {
  index: number;
  startTick: number;
  rh: NoteEvent[];
  lh: NoteEvent[];
}

/** Everything the player must press at one instant (Wait mode advances step by step). */
export interface Step {
  index: number;
  tick: number;
  measureIndex: number;
  /** Distinct MIDI numbers expected at this instant. */
  midis: number[];
  notes: { eventId: string; hand: Hand; midi: number; pitch: SpelledPitch; durationTicks: number }[];
}

export interface ExerciseMeta {
  level: number;
  tierId: string;
  rhythmComplexity: number;
  maxPolyphony: number;
  focusNotes: number[];
}

export interface Exercise {
  /** Content fingerprint (stable for identical passages). */
  id: string;
  seed: number;
  hands: HandsMode;
  /** Which staves are drawn. */
  staves: Clef[];
  key: KeySignature;
  timeSignature: TimeSignature;
  bpm: number;
  bars: number;
  totalTicks: number;
  measures: Measure[];
  steps: Step[];
  meta: ExerciseMeta;
  /** Lowest / highest MIDI number used (for fitting the keyboard). */
  range: { min: number; max: number };
}

export function allEvents(ex: Pick<Exercise, 'measures'>): NoteEvent[] {
  return ex.measures.flatMap((m) => [...m.rh, ...m.lh]);
}

/** Build Wait-mode steps: one per distinct onset across both hands. */
export function buildSteps(measures: Measure[]): Step[] {
  const byTick = new Map<number, Step>();
  for (const m of measures) {
    for (const ev of [...m.rh, ...m.lh]) {
      if (ev.pitches.length === 0) continue;
      let step = byTick.get(ev.startTick);
      if (!step) {
        step = { index: 0, tick: ev.startTick, measureIndex: ev.measureIndex, midis: [], notes: [] };
        byTick.set(ev.startTick, step);
      }
      for (const p of ev.pitches) {
        step.notes.push({ eventId: ev.id, hand: ev.hand, midi: p.midi, pitch: p, durationTicks: ev.durationTicks });
        if (!step.midis.includes(p.midi)) step.midis.push(p.midi);
      }
    }
  }
  const steps = [...byTick.values()].sort((a, b) => a.tick - b.tick);
  steps.forEach((s, i) => {
    s.index = i;
    s.midis.sort((a, b) => a - b);
  });
  return steps;
}

/** Cheap, stable string hash (FNV-1a, 32 bit) rendered as base36. */
export function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function fingerprint(ex: Pick<Exercise, 'measures' | 'key' | 'timeSignature'>): string {
  const body = ex.measures
    .map((m) =>
      [...m.rh, ...m.lh]
        .map((e) => `${e.hand}${e.startTick}:${e.durationTicks}:${e.pitches.map((p) => p.midi).join('.')}`)
        .join(','),
    )
    .join('|');
  return hashString(`${ex.key.id}/${ex.timeSignature.id}/${body}`);
}
