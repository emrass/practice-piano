import { allEvents, type Exercise, type Hand } from '../exercise';
import type { ExerciseResult, NoteResult, RhythmSummary } from '../eval/types';
import { beatPosition, isRhythmExercise } from './generator';

/** Attach rhythm figure, metric position and (Pulse) silent-bar flag to each judged note. */
export function annotateRhythm(ex: Exercise, notes: readonly NoteResult[]): NoteResult[] {
  const events = new Map(allEvents(ex).map((e) => [e.id, e]));
  const muted = isRhythmExercise(ex) ? new Set(ex.rhythm.mutedBars) : null;
  return notes.map((n) => {
    if (n.step === undefined) return n;
    const step = ex.steps[n.step];
    if (!step) return n;
    const entry = step.notes.find((x) => x.hand === n.hand && x.midi === n.midi) ?? step.notes.find((x) => x.midi === n.midi);
    const event = entry ? events.get(entry.eventId) : undefined;
    const out: NoteResult = { ...n, beat: beatPosition(step.tick, ex.timeSignature) };
    if (event?.figure) out.figure = event.figure;
    if (muted) out.muted = muted.has(step.measureIndex);
    return out;
  });
}

function mean(xs: readonly number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function sd(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

const round = (v: number | null) => (v === null ? null : Math.round(v));

/** Tendency, steadiness, Pulse drift and per-hand figures from annotated notes. */
export function summarizeRhythm(ex: Exercise, notes: readonly NoteResult[]): RhythmSummary {
  const hits = notes.filter((n) => n.correct && n.deltaMs !== undefined);
  const offsets = hits.map((n) => n.deltaMs!);
  const info = isRhythmExercise(ex) ? ex.rhythm : null;
  let driftMs: number | null = null;
  if (info?.task === 'pulse') {
    const silent = mean(hits.filter((n) => n.muted).map((n) => n.deltaMs!));
    const clicked = mean(hits.filter((n) => !n.muted).map((n) => n.deltaMs!));
    if (silent !== null && clicked !== null) driftMs = silent - clicked;
  }
  const hands: RhythmSummary['hands'] = {};
  for (const hand of ['rh', 'lh'] as Hand[]) {
    const mine = notes.filter((n) => n.hand === hand);
    if (!mine.length) continue;
    const handHits = mine.filter((n) => n.correct);
    hands[hand] = {
      notes: mine.length,
      hitRate: handHits.length / mine.length,
      timing: mean(handHits.map((n) => n.timingScore ?? 0)),
    };
  }
  return {
    task: info?.task ?? 'read',
    texture: info?.texture ?? null,
    tendencyMs: round(mean(offsets)),
    steadinessMs: round(sd(offsets)),
    driftMs: round(driftMs),
    hands,
  };
}

/** Rhythm passes need the notes *and* the time: ≥ 90 % hits and ≥ 70 % timing. */
export const RHYTHM_TIMING_PASS = 0.7;

export function rhythmResult(ex: Exercise, raw: ExerciseResult): ExerciseResult {
  const notes = annotateRhythm(ex, raw.notes);
  return { ...raw, lesson: 'rhythm', notes, rhythm: summarizeRhythm(ex, notes) };
}
