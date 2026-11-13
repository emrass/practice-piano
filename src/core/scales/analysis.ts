import { allEvents, type Hand } from '../exercise';
import type { ExerciseResult, NoteResult, ScaleSummary } from '../eval/types';
import { pitchLabel } from '../music/pitch';
import { crossingAt } from './fingering';
import type { ScaleExercise } from './generator';

/** Clean run (moves up the tempo ladder): nearly all notes, and in time. */
export const CLEAN_ACCURACY = 0.95;
export const CLEAN_TIMING = 0.8;

function mean(xs: readonly number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function sd(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

interface Played {
  hand: Hand;
  step: number;
  midi: number;
  label: string;
  finger: number | null;
  ascending: boolean;
  crossing: 'thumb-under' | 'finger-over' | null;
  /** Position in the octave cycle (same spot in every octave). */
  cyclePos: number;
  result?: NoteResult;
}

/** Each hand's notes in playing order, with direction, fingering and crossings. */
function handLines(ex: ScaleExercise, notes: readonly NoteResult[]): Record<Hand, Played[]> {
  const byStep = new Map(ex.steps.map((s) => [s.tick, s.index]));
  const lines: Record<Hand, Played[]> = { rh: [], lh: [] };
  for (const hand of ['rh', 'lh'] as const) {
    const events = allEvents(ex)
      .filter((e) => e.hand === hand && e.pitches.length)
      .sort((a, b) => a.startTick - b.startTick);
    const cycle = Math.max(1, Math.round((events.length - 1) / (2 * ex.scale.octaves)));
    events.forEach((e, i) => {
      const prev = events[i - 1];
      const next = events[i + 1];
      const ascending = prev ? e.pitches[0].midi > prev.pitches[0].midi : !!next && next.pitches[0].midi > e.pitches[0].midi;
      const finger = e.fingers?.[0] ?? null;
      const prevFinger = prev?.fingers?.[0];
      const step = byStep.get(e.startTick)!;
      lines[hand].push({
        hand,
        step,
        midi: e.pitches[0].midi,
        label: pitchLabel(e.pitches[0]),
        finger,
        ascending,
        crossing: finger !== null && prevFinger !== undefined ? crossingAt(hand, prevFinger, finger, ascending) : null,
        cyclePos: i % cycle,
        result: notes.find((n) => n.step === step && n.midi === e.pitches[0].midi && (n.hand === hand || notes.filter((m) => m.step === step).length === 1)),
      });
    });
  }
  return lines;
}

export function summarizeScale(ex: ScaleExercise, raw: ExerciseResult, goalNpm: number): ScaleSummary {
  const lines = handLines(ex, raw.notes);
  const hits = raw.notes.filter((n) => n.correct && n.deltaMs !== undefined);
  const offsets = hits.map((n) => n.deltaMs!);

  // Velocity evenness and thumb accents.
  const played = [...lines.rh, ...lines.lh].filter((p) => p.result?.correct && p.result.velocity !== undefined);
  const vels = played.map((p) => p.result!.velocity!);
  const vMean = mean(vels);
  const vSd = sd(vels);
  const thumbs = played.filter((p) => p.finger === 1).map((p) => p.result!.velocity!);
  const others = played.filter((p) => p.finger !== null && p.finger !== 1).map((p) => p.result!.velocity!);
  const thumbAccent =
    thumbs.length >= 3 && others.length >= 3 && vSd !== null && mean(thumbs)! - mean(others)! > Math.max(6, 0.5 * vSd);

  // Hand synchronisation: steps where both hands hit.
  const sync: number[] = [];
  for (const s of ex.steps) {
    const rh = lines.rh.find((p) => p.step === s.index)?.result;
    const lh = lines.lh.find((p) => p.step === s.index)?.result;
    if (rh && lh && rh !== lh && rh.correct && lh.correct && rh.deltaMs !== undefined && lh.deltaMs !== undefined) {
      sync.push(Math.abs(rh.deltaMs - lh.deltaMs));
    }
  }

  // Timing bumps: a note that arrives late (or early) relative to its neighbours, at the
  // same place in every octave — typically a thumb crossing.
  const groups = new Map<string, { p: Played; locals: number[] }>();
  const allLocals: number[] = [];
  for (const line of [lines.rh, lines.lh]) {
    line.forEach((p, i) => {
      const prev = line[i - 1]?.result;
      const next = line[i + 1]?.result;
      const cur = p.result;
      if (!cur?.correct || !prev?.correct || !next?.correct || i === line.length - 1) return;
      if (cur.deltaMs === undefined || prev.deltaMs === undefined || next.deltaMs === undefined) return;
      const local = cur.deltaMs - (prev.deltaMs + next.deltaMs) / 2;
      allLocals.push(Math.abs(local));
      const key = `${p.hand}|${p.cyclePos}|${p.ascending}`;
      const g = groups.get(key) ?? { p, locals: [] };
      g.locals.push(local);
      groups.set(key, g);
    });
  }
  const typical = allLocals.length ? [...allLocals].sort((a, b) => a - b)[Math.floor(allLocals.length / 2)] : 0;
  const bumps = [...groups.values()]
    .map((g) => ({ g, ms: mean(g.locals)! }))
    .filter(({ ms }) => Math.abs(ms) >= Math.max(25, 2 * typical))
    .sort((a, b) => Math.abs(b.ms) - Math.abs(a.ms))
    .slice(0, 3)
    .map(({ g, ms }) => ({
      label: `${g.p.label} ${g.p.ascending ? '↑' : '↓'}`,
      hand: g.p.hand,
      finger: g.p.finger,
      crossing: g.p.crossing,
      ms: Math.round(ms),
    }));

  const flow = raw.mode === 'flow';
  return {
    itemId: ex.scale.itemId,
    npm: ex.scale.npm,
    notesPerBeat: ex.scale.notesPerBeat,
    goalNpm,
    clean: flow && raw.pitchAccuracy >= CLEAN_ACCURACY && (raw.timingAccuracy ?? 0) >= CLEAN_TIMING,
    steadinessMs: flow && sd(offsets) !== null ? Math.round(sd(offsets)!) : null,
    velocitySpread: vMean && vSd !== null ? Math.round((vSd / vMean) * 100) / 100 : null,
    thumbAccent,
    syncMs: sync.length ? Math.round(mean(sync)!) : null,
    bumps: flow ? bumps : [],
  };
}

export function scaleResult(ex: ScaleExercise, raw: ExerciseResult, goalNpm: number): ExerciseResult {
  return { ...raw, lesson: 'scales', scale: summarizeScale(ex, raw, goalNpm) };
}
