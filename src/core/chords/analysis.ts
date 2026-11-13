import type { ChordOutcome, ChordSummary, ExerciseResult } from '../eval/types';
import { median } from '../eval/types';
import type { ChordJudgement } from './engine';
import { QUALITIES, type ChordQuality } from './catalog';
import { type ChordExercise, PC_NAMES } from './generator';
import { minimalMovement, movement } from './voicing';

/** Clean run (moves up the tempo ladder): nearly every chord right, and on the beat. */
export const CHORD_CLEAN_ACCURACY = 0.9;
export const CHORD_CLEAN_TIMING = 0.75;
/** Keys of one chord further apart than this sound rolled rather than together. */
export const ROLLED_MS = 120;
const OFF_BEAT_MS = 120;

function mean(xs: readonly number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function sd(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs)!;
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

const pc = (m: number) => ((m % 12) + 12) % 12;

/** The right hand's part of what was played: without the left-hand bass when there is one. */
function rightHand(played: readonly number[], lhBass: boolean): number[] {
  const sorted = [...played].sort((a, b) => a - b);
  return lhBass && sorted.length > 1 ? sorted.slice(1) : sorted;
}

export function summarizeChords(ex: ChordExercise, judgements: readonly ChordJudgement[], mode: string, goalBpm: number): ChordSummary {
  const { targets, item } = ex.chords;
  const flow = mode === 'flow';
  const byIndex = new Map(judgements.map((j) => [j.index, j]));
  const outcomes: ChordOutcome[] = targets.map((t) => {
    const j = byIndex.get(t.index);
    return {
      symbol: t.symbol,
      quality: t.spec.quality,
      rootPc: pc(t.spec.root.midi),
      inversion: t.spec.inversion,
      correct: !!j?.correct,
      wrongBass: !!j?.wrongBass,
      reactionMs: j?.reactionMs,
      deltaMs: j?.correct ? j.deltaMs : undefined,
      timingScore: j?.timingScore,
    };
  });
  const correct = outcomes.filter((o) => o.correct).length;
  const reactions = judgements.map((j) => j.reactionMs).filter((v): v is number => v !== undefined);
  const hits = judgements.filter((j) => j.correct && j.deltaMs !== undefined);
  const offsets = hits.map((j) => j.deltaMs!);
  const spreads = hits.map((j) => j.spreadMs ?? 0);
  const timing = mean(judgements.filter((j) => j.correct).map((j) => j.timingScore ?? 0));

  // Voice leading: only for progressions, between neighbouring chords both played right.
  let voiceLeading: number | null = null;
  let moves: ChordSummary['movement'] = null;
  if (item.task === 'progression') {
    const lhBass = item.hands === 'lh-bass';
    const played: number[] = [];
    const minimal: number[] = [];
    for (let i = 1; i < targets.length; i++) {
      const a = byIndex.get(i - 1);
      const b = byIndex.get(i);
      if (!a?.correct || !b?.correct) continue;
      const from = rightHand(a.played, lhBass);
      const to = rightHand(b.played, lhBass);
      played.push(movement(from, to));
      minimal.push(minimalMovement(from, targets[i].pcs));
    }
    if (played.length) {
      const p = mean(played)!;
      const m = mean(minimal)!;
      moves = { played: Math.round(p * 10) / 10, minimal: Math.round(m * 10) / 10 };
      voiceLeading = p <= m ? 1 : Math.round((Math.max(m, 0.5) / p) * 100) / 100;
    }
  }

  // Chords to look at.
  const typical = median(reactions);
  const trouble: ChordSummary['trouble'] = [];
  const seen = new Set<string>();
  const add = (t: ChordSummary['trouble'][number]) => {
    const key = `${t.symbol}|${t.reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    trouble.push(t);
  };
  for (const o of outcomes) if (o.wrongBass) add({ symbol: o.symbol, reason: 'bass' });
  outcomes.forEach((o, i) => {
    if (o.correct || o.wrongBass) return;
    add({ symbol: o.symbol, reason: byIndex.get(targets[i].index)?.hinted ? 'hint' : flow ? 'missed' : 'retry' });
  });
  if (!flow && typical !== null) {
    judgements
      .filter((j) => j.reactionMs !== undefined && j.reactionMs > Math.max(2 * typical, typical + 1500))
      .sort((a, b) => b.reactionMs! - a.reactionMs!)
      .forEach((j) => add({ symbol: targets[j.index].symbol, reason: 'slow', ms: Math.round(j.reactionMs!) }));
  }
  if (flow) {
    hits
      .filter((j) => Math.abs(j.deltaMs!) > OFF_BEAT_MS)
      .sort((a, b) => Math.abs(b.deltaMs!) - Math.abs(a.deltaMs!))
      .forEach((j) => add({ symbol: targets[j.index].symbol, reason: j.deltaMs! > 0 ? 'late' : 'early', ms: Math.round(j.deltaMs!) }));
    hits
      .filter((j) => (j.spreadMs ?? 0) > ROLLED_MS)
      .forEach((j) => add({ symbol: targets[j.index].symbol, reason: 'rolled', ms: j.spreadMs }));
  }

  const accuracy = correct / Math.max(1, targets.length);
  return {
    itemId: ex.chords.itemId,
    task: item.task,
    bpm: ex.chords.bpm,
    goalBpm,
    clean: flow && accuracy >= CHORD_CLEAN_ACCURACY && (timing ?? 0) >= CHORD_CLEAN_TIMING,
    chords: targets.length,
    correct,
    medianReactionMs: flow || typical === null ? null : Math.round(typical),
    tendencyMs: flow && offsets.length ? Math.round(mean(offsets)!) : null,
    steadinessMs: flow && sd(offsets) !== null ? Math.round(sd(offsets)!) : null,
    spreadMs: flow && spreads.length ? Math.round(median(spreads)!) : null,
    voiceLeading,
    movement: moves,
    trouble: trouble.slice(0, 4),
    outcomes,
  };
}

/** The shared result shape for a chords run (one "step" per chord). */
export function chordResult(
  ex: ChordExercise,
  judgements: readonly ChordJudgement[],
  ctx: { mode: 'wait' | 'flow'; goalBpm: number; durationMs: number; wrongPresses: number; completedAt: number },
): ExerciseResult {
  const chords = summarizeChords(ex, judgements, ctx.mode, ctx.goalBpm);
  const size = (i: number) => ex.chords.targets[i].pcs.length + (ex.chords.targets[i].bassMidi !== null ? 1 : 0);
  const totalNotes = ex.chords.targets.reduce((a, _t, i) => a + size(i), 0);
  const correctNotes = chords.outcomes.reduce((a, o, i) => a + (o.correct ? size(i) : 0), 0);
  const hits = judgements.filter((j) => j.correct);
  const flow = ctx.mode === 'flow';
  return {
    lesson: 'chords',
    mode: ctx.mode,
    exerciseId: ex.id,
    level: ex.meta.level,
    tierId: ex.meta.tierId,
    totalNotes,
    correctNotes,
    wrongNotes: ctx.wrongPresses,
    missedNotes: flow ? chords.chords - chords.correct : 0,
    pitchAccuracy: chords.correct / Math.max(1, chords.chords),
    timingAccuracy: flow ? (mean(hits.map((j) => j.timingScore ?? 0)) ?? 0) : null,
    medianReactionMs: chords.medianReactionMs,
    meanAbsTimingMs: flow && hits.length ? Math.round(mean(hits.map((j) => Math.abs(j.deltaMs ?? 0)))!) : null,
    cleanSteps: chords.correct,
    totalSteps: chords.chords,
    durationMs: ctx.durationMs,
    notes: [],
    completedAt: ctx.completedAt,
    hints: flow ? undefined : judgements.filter((j) => j.hinted).length,
    chords,
  };
}

/** "Diminished", "E♭ chords", "1st inversion" — a weak chord statistic in words. */
export function weakChordLabel(w: { dimension: string; key: string }): string {
  if (w.dimension === 'chordQuality') return QUALITIES[w.key as ChordQuality]?.name ?? w.key;
  if (w.dimension === 'chordRoot') return `${PC_NAMES[Number(w.key)]} chords`;
  return ['Root position', '1st inversion', '2nd inversion', '3rd inversion'][Number(w.key)] ?? w.key;
}
