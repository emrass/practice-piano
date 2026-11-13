import type { Clef } from '../exercise';
import type { ExerciseResult, NoteResult, PracticeMode } from '../eval/types';
import { median } from '../eval/types';
import { tierForLevel } from '../generator/tiers';
import { findTier, LESSONS, type LessonId } from '../lessons';
import { RHYTHM_TIMING_PASS } from '../rhythm/analysis';
import { applyRepertoireRun, type LadderRun, normalizeRepertoire, type RepertoireChange, type RepertoireItem } from '../repertoire/repertoire';

export const PROGRESS_SCHEMA_VERSION = 1;
export const MASTERY_ACCURACY = 0.9;
const MAX_REACTION_SAMPLES = 20;
const MAX_HISTORY = 200;
const MAX_ATTEMPT_IDS = 400;
const MAX_DAYS = 120;

/**
 * Generic per-key aggregate. Stats are stored as dimension → key → Aggregate so that new
 * weakness dimensions (intervals, accidentals, key signatures, rhythm patterns…) can be
 * added later without a schema change or touching lesson logic.
 */
export interface Aggregate {
  attempts: number;
  correct: number;
  /** Most recent reaction times (ms), for medians. */
  reactions: number[];
  timingSum: number;
  timingCount: number;
  /** Signed timing offsets (ms) of hits — tendency (mean) and steadiness (spread). */
  offsetSum?: number;
  offsetSqSum?: number;
  offsetCount?: number;
}

/**
 * Sight reading records 'note' (key = "treble:60") and 'clef' (key = "treble").
 * Ear training records 'interval' (melodic, key = semitones "0"–"12") and 'harmony'
 * (key = "h4" for a dyad of 4 semitones, "triad", "seventh").
 * Rhythm (and sight reading in Flow mode) records 'rhythmFigure' (key = figure, e.g. "6,2"),
 * 'beatPosition' (downbeat / beat / offbeat / sixteenth); Rhythm also 'rhythmHand' and
 * 'rhythmTexture'. Scales record 'scaleKey'; chords 'chordQuality' (maj, m7…), 'chordRoot'
 * (pitch class "0"–"11") and 'chordInversion' ("0"–"3").
 */
export type StatDimension =
  | 'note'
  | 'clef'
  | 'interval'
  | 'harmony'
  | 'rhythmFigure'
  | 'beatPosition'
  | 'rhythmHand'
  | 'rhythmTexture'
  | 'scaleKey'
  | 'chordQuality'
  | 'chordRoot'
  | 'chordInversion';

export interface TierProgress {
  attempts: number;
  passes: number;
  /** Ids of distinct passages passed (mastery needs different passages, not repeats). */
  passedExercises: string[];
  bestAccuracy: number;
  mastered: boolean;
  masteredAt?: number;
}

export interface DayLog {
  exercises: number;
  xp: number;
  practiceMs: number;
}

export interface HistoryEntry {
  at: number;
  /** Absent on entries recorded before lessons existed (= sight reading). */
  lesson?: LessonId;
  replays?: number;
  exerciseId: string;
  mode: PracticeMode;
  level: number;
  tierId: string;
  pitchAccuracy: number;
  timingAccuracy: number | null;
  medianReactionMs: number | null;
  xp: number;
  firstSight: boolean;
  passed: boolean;
}

export interface ProgressState {
  schemaVersion: number;
  xp: number;
  exercisesCompleted: number;
  streak: { current: number; best: number; lastDay: string | null };
  days: Record<string, DayLog>;
  tiers: Record<string, TierProgress>;
  stats: Record<string, Record<string, Aggregate>>;
  /** exerciseId → completed attempts (for the first-sight bonus). */
  attempts: Record<string, number>;
  history: HistoryEntry[];
  /** Fixed-repertoire items (scales, chords): tempo ladder and review schedule. */
  repertoire: Record<string, RepertoireItem>;
}

export interface Award {
  xp: number;
  baseXp: number;
  firstSightBonus: number;
  firstAttempt: boolean;
  passed: boolean;
  tierId: string;
  tierPasses: number;
  tierRequired: number;
  newlyMastered: boolean;
  /** Level used for the XP multiplier (capped until higher tiers are mastered). */
  effectiveLevel: number;
  levelCapped: boolean;
  streak: number;
  /** Repertoire lessons: what this run did to the item's ladder and review date. */
  repertoire?: RepertoireChange;
}

export function emptyProgress(): ProgressState {
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    xp: 0,
    exercisesCompleted: 0,
    streak: { current: 0, best: 0, lastDay: null },
    days: {},
    tiers: {},
    stats: {},
    attempts: {},
    history: [],
    repertoire: {},
  };
}

export function emptyAggregate(): Aggregate {
  return { attempts: 0, correct: 0, reactions: [], timingSum: 0, timingCount: 0 };
}

/** Local calendar day, YYYY-MM-DD. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

export function updateStreak(streak: ProgressState['streak'], today: string): ProgressState['streak'] {
  if (streak.lastDay === today) return streak;
  const current = streak.lastDay === previousDay(today) ? streak.current + 1 : 1;
  return { current, best: Math.max(streak.best, current), lastDay: today };
}

/** Streak as displayed today (a streak is lost once a full day is skipped). */
export function displayStreak(streak: ProgressState['streak'], today: string): number {
  if (!streak.lastDay) return 0;
  if (streak.lastDay === today || streak.lastDay === previousDay(today)) return streak.current;
  return 0;
}

export function highestMasteredTierIndex(progress: ProgressState, lesson: LessonId = 'sight'): number {
  let best = -1;
  LESSONS[lesson].tiers.forEach((t, i) => {
    if (progress.tiers[t.id]?.mastered) best = i;
  });
  return best;
}

/**
 * The XP level multiplier only grows up to the top of the second tier above your highest
 * mastered tier, so cranking the slider without accuracy earns nothing extra.
 */
export function xpLevelCeiling(progress: ProgressState, lesson: LessonId = 'sight'): number {
  const tiers = LESSONS[lesson].tiers;
  const next = Math.min(tiers.length - 1, highestMasteredTierIndex(progress, lesson) + 2);
  return tiers[next].maxLevel;
}

function accuracyFactor(acc: number): number {
  const x = Math.min(1, Math.max(0, (acc - 0.5) / 0.5));
  return x * x;
}

/** Pass = mastery accuracy; Rhythm additionally needs the timing. */
export function isPass(result: ExerciseResult): boolean {
  if (result.lesson === 'scales') return result.mode === 'flow' ? !!result.scale?.clean : result.pitchAccuracy >= MASTERY_ACCURACY;
  if (result.lesson === 'chords') return result.mode === 'flow' ? !!result.chords?.clean : result.pitchAccuracy >= MASTERY_ACCURACY;
  if (result.pitchAccuracy < MASTERY_ACCURACY) return false;
  if (result.lesson === 'rhythm') return (result.timingAccuracy ?? 0) >= RHYTHM_TIMING_PASS;
  return true;
}

/**
 * Repertoire XP: repetition is the point, so no first-sight bonus or repeat penalty; faster
 * clean playing earns more (tempo relative to 4 notes per second).
 */
function repertoireAward(progress: ProgressState, result: ExerciseResult): Award {
  const flow = result.mode === 'flow';
  // Tempo relative to 4 notes per second (scales) or 60 bpm with a chord per bar (chords).
  const ratio = result.chords ? result.chords.bpm / 60 : (result.scale?.npm ?? 120) / 240;
  const tempo = Math.min(2, Math.max(0.5, ratio));
  const xp = Math.round(result.totalNotes * accuracyFactor(result.pitchAccuracy) * (flow ? (0.6 + 0.6 * (result.timingAccuracy ?? 0)) * tempo : 0.5));
  return {
    xp,
    baseXp: xp,
    firstSightBonus: 0,
    firstAttempt: (progress.attempts[result.exerciseId] ?? 0) === 0,
    passed: isPass(result),
    tierId: result.tierId,
    tierPasses: 0,
    tierRequired: 0,
    newlyMastered: false,
    effectiveLevel: 0,
    levelCapped: false,
    streak: progress.streak.current,
  };
}

export function computeAward(progress: ProgressState, result: ExerciseResult): Award {
  const lesson: LessonId = result.lesson ?? 'sight';
  if (LESSONS[lesson].repertoire) return repertoireAward(progress, result);
  const tier = findTier(result.tierId) ?? LESSONS[lesson].tierForLevel(result.level) ?? tierForLevel(result.level);
  const tierState = progress.tiers[tier.id];
  const firstAttempt = (progress.attempts[result.exerciseId] ?? 0) === 0;
  const ceiling = xpLevelCeiling(progress, lesson);
  const effectiveLevel = Math.min(result.level, ceiling);
  const levelMult = 1 + effectiveLevel / 50;
  // Flow: timing matters. Ear: every extra listen costs a little (the first one is free).
  const modeMult =
    result.mode === 'flow' ? 0.6 + 0.6 * (result.timingAccuracy ?? 0) : result.mode === 'ear' ? 1 / (1 + 0.2 * (result.replays ?? 0)) : 1;
  const baseXp = Math.round(result.totalNotes * levelMult * accuracyFactor(result.pitchAccuracy) * modeMult);
  const passed = isPass(result);
  const firstSightBonus = firstAttempt && passed ? Math.round(baseXp * 0.5) + 5 : 0;
  const xp = Math.round(baseXp * (firstAttempt ? 1 : 0.4)) + firstSightBonus;
  const already = tierState?.passedExercises.includes(result.exerciseId) ?? false;
  const tierPasses = (tierState?.passes ?? 0) + (passed && !already ? 1 : 0);
  const newlyMastered = !tierState?.mastered && tierPasses >= tier.passesRequired;
  return {
    xp,
    baseXp,
    firstSightBonus,
    firstAttempt,
    passed,
    tierId: tier.id,
    tierPasses,
    tierRequired: tier.passesRequired,
    newlyMastered,
    effectiveLevel,
    levelCapped: effectiveLevel < result.level,
    streak: progress.streak.current,
  };
}

function trimRecord<T>(record: Record<string, T>, max: number): Record<string, T> {
  const keys = Object.keys(record);
  if (keys.length <= max) return record;
  const keep = keys.sort().slice(keys.length - max);
  return Object.fromEntries(keep.map((k) => [k, record[k]]));
}

function addObservation(
  stats: ProgressState['stats'],
  dimension: StatDimension,
  key: string,
  correct: boolean,
  reactionMs?: number,
  timingScore?: number,
  offsetMs?: number,
): void {
  const dim = (stats[dimension] ??= {});
  const agg = (dim[key] ??= emptyAggregate());
  agg.attempts++;
  if (correct) agg.correct++;
  if (offsetMs !== undefined && correct) {
    agg.offsetSum = (agg.offsetSum ?? 0) + offsetMs;
    agg.offsetSqSum = (agg.offsetSqSum ?? 0) + offsetMs * offsetMs;
    agg.offsetCount = (agg.offsetCount ?? 0) + 1;
  }
  if (reactionMs !== undefined) {
    agg.reactions.push(Math.round(reactionMs));
    if (agg.reactions.length > MAX_REACTION_SAMPLES) agg.reactions.splice(0, agg.reactions.length - MAX_REACTION_SAMPLES);
  }
  if (timingScore !== undefined) {
    agg.timingSum += timingScore;
    agg.timingCount++;
  }
}

export function noteStatKey(clef: Clef, midi: number): string {
  return `${clef}:${midi}`;
}

/** Pure: returns a new progress object plus what was earned. */
export function applyResult(progress: ProgressState, result: ExerciseResult, now: Date): { progress: ProgressState; award: Award } {
  const next: ProgressState = structuredClone(progress);
  const today = dayKey(now);
  next.streak = updateStreak(next.streak, today);
  const award = { ...computeAward(progress, result), streak: next.streak.current };

  next.xp += award.xp;
  next.exercisesCompleted++;
  next.attempts[result.exerciseId] = (next.attempts[result.exerciseId] ?? 0) + 1;
  next.attempts = trimRecord(next.attempts, MAX_ATTEMPT_IDS);

  const day = (next.days[today] ??= { exercises: 0, xp: 0, practiceMs: 0 });
  day.exercises++;
  day.xp += award.xp;
  day.practiceMs += Math.min(result.durationMs, 30 * 60 * 1000);
  next.days = trimRecord(next.days, MAX_DAYS);

  const lesson = result.lesson ?? 'sight';
  if (LESSONS[lesson].repertoire) recordRepertoireRun(next, award, result, now);
  else recordTierRun(next, award, result, now);

  if (lesson === 'ear') {
    recordEarObservations(next.stats, result);
  } else if (lesson === 'scales') {
    // Per-item data lives in `repertoire`; key familiarity is a shared tag (DIDACTICS §3).
    if (result.scale) {
      const key = result.scale.itemId.split('/')[1];
      addObservation(next.stats, 'scaleKey', key, result.pitchAccuracy >= MASTERY_ACCURACY, undefined, result.timingAccuracy ?? undefined);
    }
  } else if (lesson === 'chords') {
    for (const o of result.chords?.outcomes ?? []) {
      addObservation(next.stats, 'chordQuality', o.quality, o.correct, o.reactionMs, o.timingScore, o.deltaMs);
      addObservation(next.stats, 'chordRoot', String(o.rootPc), o.correct, o.reactionMs, o.timingScore, o.deltaMs);
      addObservation(next.stats, 'chordInversion', String(o.inversion), o.correct, o.reactionMs, o.timingScore, o.deltaMs);
    }
  } else if (lesson === 'rhythm') {
    for (const n of result.notes) {
      recordTimeObservations(next.stats, n);
      addObservation(next.stats, 'rhythmHand', n.hand, n.correct, undefined, n.timingScore, n.deltaMs);
      if (result.rhythm?.texture) addObservation(next.stats, 'rhythmTexture', result.rhythm.texture, n.correct, undefined, n.timingScore, n.deltaMs);
    }
  } else {
    for (const n of result.notes) {
      addObservation(next.stats, 'note', noteStatKey(n.clef, n.midi), n.correct, n.reactionMs, n.timingScore);
      addObservation(next.stats, 'clef', n.clef, n.correct, n.reactionMs, n.timingScore);
      // Rhythm figures are shared with Rhythm mode, but only Flow mode measures time.
      if (result.mode === 'flow') recordTimeObservations(next.stats, n);
    }
  }

  next.history.push({
    at: now.getTime(),
    lesson: result.lesson ?? 'sight',
    replays: result.replays,
    exerciseId: result.exerciseId,
    mode: result.mode,
    level: result.level,
    tierId: award.tierId,
    pitchAccuracy: result.pitchAccuracy,
    timingAccuracy: result.timingAccuracy,
    medianReactionMs: result.medianReactionMs,
    xp: award.xp,
    firstSight: award.firstSightBonus > 0,
    passed: award.passed,
  });
  if (next.history.length > MAX_HISTORY) next.history.splice(0, next.history.length - MAX_HISTORY);
  return { progress: next, award };
}

function recordTierRun(next: ProgressState, award: Award, result: ExerciseResult, now: Date): void {
  const tier = (next.tiers[award.tierId] ??= { attempts: 0, passes: 0, passedExercises: [], bestAccuracy: 0, mastered: false });
  tier.attempts++;
  tier.bestAccuracy = Math.max(tier.bestAccuracy, result.pitchAccuracy);
  if (award.passed && !tier.passedExercises.includes(result.exerciseId)) {
    tier.passes++;
    tier.passedExercises.push(result.exerciseId);
    if (tier.passedExercises.length > 50) tier.passedExercises.shift();
  }
  if (award.newlyMastered) {
    tier.mastered = true;
    tier.masteredAt = now.getTime();
  }
}

/** What a repertoire run tells the item's tempo ladder. */
export function ladderRun(result: ExerciseResult): LadderRun | null {
  const s = result.scale;
  if (s) return { itemId: s.itemId, tempo: s.npm, notesPerBeat: s.notesPerBeat, goalTempo: s.goalNpm, clean: s.clean };
  const c = result.chords;
  if (c) return { itemId: c.itemId, tempo: c.bpm, notesPerBeat: 1, goalTempo: c.goalBpm, clean: c.clean };
  return null;
}

/** Repertoire lessons: tempo ladder, mastery and review date of the item. */
function recordRepertoireRun(next: ProgressState, award: Award, result: ExerciseResult, now: Date): void {
  const ladder = ladderRun(result);
  if (!ladder) return;
  const id = ladder.itemId;
  const { item, change } = applyRepertoireRun(next.repertoire[id], { mode: result.mode, accuracy: result.pitchAccuracy, ladder }, now.getTime());
  next.repertoire[id] = item;
  award.repertoire = change;
  award.newlyMastered = change.newlyMastered;
}

function recordTimeObservations(stats: ProgressState['stats'], n: NoteResult): void {
  if (n.figure) addObservation(stats, 'rhythmFigure', n.figure, n.correct, undefined, n.timingScore, n.deltaMs);
  if (n.beat) addObservation(stats, 'beatPosition', n.beat, n.correct, undefined, n.timingScore, n.deltaMs);
}

/** Ear training: melodic intervals between single-note steps, and chord shapes. */
function recordEarObservations(stats: ProgressState['stats'], result: ExerciseResult): void {
  const byStep = new Map<number, { midis: number[]; correct: boolean }>();
  for (const n of result.notes) {
    if (n.step === undefined) continue;
    const s = byStep.get(n.step) ?? { midis: [], correct: true };
    s.midis.push(n.midi);
    s.correct &&= n.correct;
    byStep.set(n.step, s);
  }
  const steps = [...byStep.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  steps.forEach((s, i) => {
    if (s.midis.length === 1) {
      const prev = steps[i - 1];
      if (prev?.midis.length === 1) {
        const semis = Math.min(12, Math.abs(s.midis[0] - prev.midis[0]));
        addObservation(stats, 'interval', String(semis), s.correct);
      }
    } else {
      const sorted = [...s.midis].sort((a, b) => a - b);
      const key = sorted.length === 2 ? `h${sorted[1] - sorted[0]}` : sorted.length === 3 ? 'triad' : 'seventh';
      addObservation(stats, 'harmony', key, s.correct);
    }
  });
}

export const INTERVAL_NAMES = ['Unison', 'm2', 'M2', 'm3', 'M3', 'P4', 'Tritone', 'P5', 'm6', 'M6', 'm7', 'M7', 'Octave'] as const;

export interface WeakInterval {
  semitones: number;
  attempts: number;
  accuracy: number;
}

/** Melodic intervals the player consistently misses (ear training weak spots). */
export function findWeakIntervals(progress: ProgressState, minAttempts = 4, limit = 4): WeakInterval[] {
  return Object.entries(progress.stats.interval ?? {})
    .map(([k, a]) => ({ semitones: Number(k), attempts: a.attempts, accuracy: a.correct / Math.max(1, a.attempts) }))
    .filter((w) => w.attempts >= minAttempts && w.accuracy < 0.8)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, limit);
}

export interface TimeStat {
  key: string;
  attempts: number;
  /** Share of notes hit inside the timing window. */
  accuracy: number;
  /** Average timing quality of the hits (0–1), null without hits. */
  timing: number | null;
  /** Average signed offset (ms): negative = rushing, positive = dragging. */
  tendencyMs: number | null;
  /** Spread of the offsets (ms). */
  steadinessMs: number | null;
}

export function timeStat(key: string, a: Aggregate): TimeStat {
  const n = a.offsetCount ?? 0;
  const meanOffset = n ? (a.offsetSum ?? 0) / n : null;
  const variance = n > 1 && meanOffset !== null ? Math.max(0, (a.offsetSqSum ?? 0) / n - meanOffset * meanOffset) : null;
  return {
    key,
    attempts: a.attempts,
    accuracy: a.correct / Math.max(1, a.attempts),
    timing: a.timingCount ? a.timingSum / a.timingCount : null,
    tendencyMs: meanOffset === null ? null : Math.round(meanOffset),
    steadinessMs: variance === null ? null : Math.round(Math.sqrt(variance)),
  };
}

export function timeStats(progress: ProgressState, dimension: StatDimension): TimeStat[] {
  return Object.entries(progress.stats[dimension] ?? {}).map(([k, a]) => timeStat(k, a));
}

/** Weakness score for a rhythm statistic: misses weigh most, then loose timing. */
function rhythmWeakness(t: TimeStat): number {
  return (1 - t.accuracy) * 2 + (1 - (t.timing ?? 0));
}

/**
 * Rhythm figures that are often missed or played loosely — shared by Rhythm mode and sight
 * reading in Flow mode (both draw from the same figure library).
 */
export function findWeakFigures(progress: ProgressState, minAttempts = 6, limit = 4): TimeStat[] {
  return timeStats(progress, 'rhythmFigure')
    .filter((t) => t.attempts >= minAttempts && (t.accuracy < 0.85 || (t.timing ?? 0) < 0.65))
    .sort((a, b) => rhythmWeakness(b) - rhythmWeakness(a))
    .slice(0, limit);
}

export interface WeakChordStat {
  dimension: 'chordQuality' | 'chordRoot' | 'chordInversion';
  key: string;
  attempts: number;
  accuracy: number;
  medianReactionMs: number | null;
  /** Higher = weaker. */
  score: number;
}

/**
 * Chord qualities, roots and inversions that are often wrong or slow to find. Slowness is
 * relative to the player's own typical reaction across all chords.
 */
export function findWeakChords(progress: ProgressState, minAttempts = 8, limit = 6): WeakChordStat[] {
  const dims = ['chordQuality', 'chordRoot', 'chordInversion'] as const;
  const all = dims.flatMap((dimension) =>
    Object.entries(progress.stats[dimension] ?? {}).map(([key, agg]) => ({ dimension, key, agg })),
  );
  const overall = median(all.map((a) => median(a.agg.reactions)).filter((v): v is number => v !== null));
  return all
    .filter((a) => a.agg.attempts >= minAttempts)
    .map(({ dimension, key, agg }) => {
      const accuracy = agg.correct / agg.attempts;
      const med = median(agg.reactions);
      const slowness = med !== null && overall ? Math.max(0, med / overall - 1) : 0;
      return { dimension, key, attempts: agg.attempts, accuracy, medianReactionMs: med, score: (1 - accuracy) * 2 + slowness };
    })
    .filter((w) => w.accuracy < 0.85 || w.score > 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export interface WeakNote {
  midi: number;
  clef: Clef;
  attempts: number;
  accuracy: number;
  medianReactionMs: number | null;
  /** Higher = weaker. */
  score: number;
}

export interface WeakSpots {
  notes: WeakNote[];
  clefs: { clef: Clef; accuracy: number; medianReactionMs: number | null; attempts: number }[];
  weakestClef: Clef | null;
}

/**
 * Notes that are consistently missed or slow. A note needs a minimum number of attempts
 * so one slip doesn't flag it.
 */
export function findWeakSpots(progress: ProgressState, minAttempts = 4, limit = 6): WeakSpots {
  const noteStats = progress.stats.note ?? {};
  const all = Object.entries(noteStats).map(([key, agg]) => {
    const [clef, midi] = key.split(':');
    return { clef: clef as Clef, midi: Number(midi), agg };
  });
  const reactionMedians = all.map((n) => median(n.agg.reactions)).filter((v): v is number => v !== null);
  const overallReaction = median(reactionMedians);
  const notes: WeakNote[] = all
    .filter((n) => n.agg.attempts >= minAttempts)
    .map((n) => {
      const accuracy = n.agg.correct / n.agg.attempts;
      const med = median(n.agg.reactions);
      const slowness = med !== null && overallReaction ? Math.max(0, med / overallReaction - 1) : 0;
      return { midi: n.midi, clef: n.clef, attempts: n.agg.attempts, accuracy, medianReactionMs: med, score: (1 - accuracy) * 2 + slowness };
    })
    .filter((n) => n.accuracy < 0.85 || n.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const clefs = (['treble', 'bass'] as Clef[])
    .map((clef) => {
      const agg = progress.stats.clef?.[clef];
      return agg
        ? { clef, accuracy: agg.correct / Math.max(1, agg.attempts), medianReactionMs: median(agg.reactions), attempts: agg.attempts }
        : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  const eligible = clefs.filter((c) => c.attempts >= minAttempts * 3);
  const weakestClef =
    eligible.length === 2 && Math.abs(eligible[0].accuracy - eligible[1].accuracy) > 0.03
      ? eligible.sort((a, b) => a.accuracy - b.accuracy)[0].clef
      : null;
  return { notes, clefs, weakestClef };
}

/** Per-MIDI accuracy across clefs, for the keyboard heatmap. */
export function noteHeatmap(progress: ProgressState, clef?: Clef): Map<number, { attempts: number; accuracy: number }> {
  const out = new Map<number, { attempts: number; correct: number }>();
  for (const [key, agg] of Object.entries(progress.stats.note ?? {})) {
    const [c, midi] = key.split(':');
    if (clef && c !== clef) continue;
    const m = Number(midi);
    const cur = out.get(m) ?? { attempts: 0, correct: 0 };
    cur.attempts += agg.attempts;
    cur.correct += agg.correct;
    out.set(m, cur);
  }
  return new Map([...out].map(([m, v]) => [m, { attempts: v.attempts, accuracy: v.correct / Math.max(1, v.attempts) }]));
}

/** Recent aggregate metrics for the dashboard. */
export function recentSummary(progress: ProgressState, count = 20, lesson?: LessonId) {
  const recent = progress.history.filter((h) => !lesson || (h.lesson ?? 'sight') === lesson).slice(-count);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    exercises: recent.length,
    pitchAccuracy: avg(recent.map((h) => h.pitchAccuracy)),
    timingAccuracy: avg(recent.filter((h) => h.timingAccuracy !== null).map((h) => h.timingAccuracy as number)),
    medianReactionMs: median(recent.map((h) => h.medianReactionMs).filter((v): v is number => v !== null)),
    replays: recent.length ? Math.round((recent.reduce((a, h) => a + (h.replays ?? 0), 0) / recent.length) * 10) / 10 : 0,
  };
}

/** Defensive normalisation for data loaded from storage or an import file. */
export function normalizeProgress(raw: unknown): ProgressState {
  const base = emptyProgress();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<ProgressState>;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const obj = <T>(v: unknown, d: T): T => (v && typeof v === 'object' && !Array.isArray(v) ? (v as T) : d);
  return {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    xp: num(r.xp, 0),
    exercisesCompleted: num(r.exercisesCompleted, 0),
    streak: {
      current: num(r.streak?.current, 0),
      best: num(r.streak?.best, 0),
      lastDay: typeof r.streak?.lastDay === 'string' ? r.streak.lastDay : null,
    },
    days: obj(r.days, base.days),
    tiers: obj(r.tiers, base.tiers),
    stats: obj(r.stats, base.stats),
    attempts: obj(r.attempts, base.attempts),
    history: Array.isArray(r.history) ? r.history.slice(-MAX_HISTORY) : [],
    repertoire: normalizeRepertoire(r.repertoire),
  };
}
