import type { ChordOutcome, ChordsResult, ChordSummary } from '../eval/types';
import { median } from '../eval/types';
import type { ChordJudgment } from './engine';
import { drillHandsOf, QUALITIES, type ChordQuality } from './catalog';
import { type ChordExercise, PC_NAMES } from './generator';
import { minimalMovement, movement } from './voicing';

/** Clean run (moves up the tempo ladder): nearly every chord right, and on the beat. Below that accuracy the ladder moves down. */
export const CHORD_CLEAN_ACCURACY = 0.9;
export const CHORD_CLEAN_TIMING = 0.75;
/**
 * A sequence has too few chords for a share to be fair (one miss in seven is 86%): a clean run
 * has every chord, one miss keeps the tempo, and from this many misses the ladder moves down.
 */
export const SEQUENCE_MESSY_MISSES = 2;
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

export function summarizeChords(ex: ChordExercise, judgments: readonly ChordJudgment[], mode: string, goalBpm: number): ChordSummary {
  const { targets, item } = ex.chords;
  const flow = mode === 'flow';
  const byIndex = new Map(judgments.map((j) => [j.index, j]));
  // Only notation drills read the chord in a clef; symbols and progressions say nothing about it.
  const readHands = item.task === 'drill' && item.prompt === 'notation' ? drillHandsOf(item.prompt, item.drillHands) : undefined;
  const outcomes: ChordOutcome[] = targets.map((t) => {
    const j = byIndex.get(t.index);
    return {
      symbol: t.symbol,
      quality: t.spec.quality,
      rootPc: pc(t.spec.root.midi),
      inversion: t.spec.inversion,
      ...(readHands ? { readHands } : {}),
      correct: !!j?.correct,
      wrongBass: !!j?.wrongBass,
      reactionMs: j?.reactionMs,
      deltaMs: j?.correct ? j.deltaMs : undefined,
      timingScore: j?.timingScore,
    };
  });
  const correct = outcomes.filter((o) => o.correct).length;
  const reactions = judgments.map((j) => j.reactionMs).filter((v): v is number => v !== undefined);
  const hits = judgments.filter((j) => j.correct && j.deltaMs !== undefined);
  const offsets = hits.map((j) => j.deltaMs!);
  const spreads = hits.map((j) => j.spreadMs ?? 0);
  const timing = mean(judgments.filter((j) => j.correct).map((j) => j.timingScore ?? 0));

  // Voice leading: only for progressions from the chart (from the staff the voicing is written,
  // so a right chord always moves as shown), between neighboring chords both played right.
  let voiceLeading: number | null = null;
  let moves: ChordSummary['movement'] = null;
  if (item.task === 'progression' && !item.notation) {
    const played: number[] = [];
    const minimal: number[] = [];
    for (let i = 1; i < targets.length; i++) {
      const a = byIndex.get(i - 1);
      const b = byIndex.get(i);
      if (!a?.correct || !b?.correct) continue;
      const from = a.played;
      const to = b.played;
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
  const add = (index: number, reason: ChordSummary['trouble'][number]['reason'], ms?: number) => {
    const { symbol, leg } = targets[index];
    const key = `${symbol}|${leg ?? ''}|${reason}`;
    if (seen.has(key)) return;
    seen.add(key);
    trouble.push({ symbol, ...(leg ? { leg } : {}), reason, ...(ms === undefined ? {} : { ms }) });
  };
  outcomes.forEach((o, i) => {
    if (o.wrongBass) add(i, 'bass');
  });
  outcomes.forEach((o, i) => {
    if (o.correct || o.wrongBass) return;
    add(i, byIndex.get(targets[i].index)?.hinted ? 'hint' : flow ? 'missed' : 'retry');
  });
  if (!flow && typical !== null) {
    judgments
      .filter((j) => j.reactionMs !== undefined && j.reactionMs > Math.max(2 * typical, typical + 1500))
      .sort((a, b) => b.reactionMs! - a.reactionMs!)
      .forEach((j) => add(j.index, 'slow', Math.round(j.reactionMs!)));
  }
  if (flow) {
    hits
      .filter((j) => Math.abs(j.deltaMs!) > OFF_BEAT_MS)
      .sort((a, b) => Math.abs(b.deltaMs!) - Math.abs(a.deltaMs!))
      .forEach((j) => add(j.index, j.deltaMs! > 0 ? 'late' : 'early', Math.round(j.deltaMs!)));
    hits
      .filter((j) => (j.spreadMs ?? 0) > ROLLED_MS)
      .forEach((j) => add(j.index, 'rolled', j.spreadMs));
  }

  const accuracy = correct / Math.max(1, targets.length);
  const missed = targets.length - correct;
  const sequence = item.task === 'sequence';
  return {
    itemId: ex.chords.itemId,
    task: item.task,
    bpm: ex.chords.bpm,
    goalBpm,
    clean: flow && (sequence ? missed === 0 : accuracy >= CHORD_CLEAN_ACCURACY) && (timing ?? 0) >= CHORD_CLEAN_TIMING,
    messy: flow && (sequence ? missed >= SEQUENCE_MESSY_MISSES : accuracy < CHORD_CLEAN_ACCURACY),
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
  judgments: readonly ChordJudgment[],
  ctx: { mode: 'wait' | 'flow'; goalBpm: number; durationMs: number; wrongPresses: number; completedAt: number },
): ChordsResult {
  const chords = summarizeChords(ex, judgments, ctx.mode, ctx.goalBpm);
  const size = (i: number) => {
    const t = ex.chords.targets[i];
    return t.voicing.length + (t.bassMidi !== null ? 1 : 0) + (t.lhChord?.length ?? 0);
  };
  const totalNotes = ex.chords.targets.reduce((a, _t, i) => a + size(i), 0);
  const correctNotes = chords.outcomes.reduce((a, o, i) => a + (o.correct ? size(i) : 0), 0);
  const hits = judgments.filter((j) => j.correct);
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
    hints: flow ? undefined : judgments.filter((j) => j.hinted).length,
    chords,
  };
}

const READ_HANDS_LABEL: Record<string, string> = { rh: 'Right-hand chords', lh: 'Left-hand chords', 'lh-bass': 'Chords over a left-hand bass', both: 'Chords hands together' };

/** "Diminished", "E♭ chords", "1st inversion", "Left-hand chords": a weak chord statistic in words. */
export function weakChordLabel(w: { dimension: string; key: string }): string {
  if (w.dimension === 'chordQuality') return QUALITIES[w.key as ChordQuality]?.name ?? w.key;
  if (w.dimension === 'chordRoot') return `${PC_NAMES[Number(w.key)]} chords`;
  if (w.dimension === 'chordHands') return READ_HANDS_LABEL[w.key] ?? w.key;
  return ['Root position', '1st inversion', '2nd inversion', '3rd inversion'][Number(w.key)] ?? w.key;
}
