
import { dayKey, isDayKey } from '../progress/days';

/**
 * Per-item progress for fixed-repertoire lessons (DIDACTICS §2): a tempo ladder instead of a
 * level, mastery at a goal tempo, and spaced review (Leitner boxes) so weak or old items
 * come back sooner. Pure functions; stored in ProgressState.repertoire.
 *
 * Tempo is in the lesson's own unit: notes per minute for scales (so switching eighths and
 * sixteenths keeps the speed), beats per minute for chords (one chord per bar).
 */
export interface RepertoireItem {
  attempts: number;
  cleanRuns: number;
  /** Current ladder tempo, in the lesson's unit. */
  ladderTempo: number;
  bestCleanTempo: number;
  /** Leitner box 0–5: the review interval doubles with each clean run. */
  box: number;
  dueAt: number;
  lastAt: number;
  /** Rolling accuracy (exponential average). */
  accuracy: number;
  mastered: boolean;
  masteredAt?: number;
  /**
   * Ladder tempo over time: `[day, tempo]`, oldest first, at most `MAX_LADDER_LOG` entries. The
   * first entry is the starting tempo; after that a day keeps one entry, its latest tempo.
   * Items saved before the log existed start it at their tempo of that time.
   */
  ladderLog?: LadderLogEntry[];
}

/** A day (YYYY-MM-DD) and the ladder tempo at the end of it. */
export type LadderLogEntry = [day: string, tempo: number];

export interface RepertoireChange {
  itemId: string;
  fromTempo: number;
  toTempo: number;
  clean: boolean;
  newlyMastered: boolean;
  mastered: boolean;
  dueInDays: number;
}

/** What a run tells the ladder. */
export interface LadderRun {
  itemId: string;
  /** Tempo of the run, in the lesson's unit. */
  tempo: number;
  /** Ladder step = 4 bpm × this: notes per beat for scales, 1 for chords. */
  notesPerBeat: number;
  goalTempo: number;
  clean: boolean;
}

const DAY = 24 * 60 * 60 * 1000;
/** Review interval (days) per box. Box 0 = due again today. */
export const REVIEW_DAYS = [0, 1, 2, 4, 8, 16] as const;
export const LADDER_STEP_BPM = 4;
export const MIN_TEMPO = 30;
export const MAX_TEMPO = 960;
export const MAX_LADDER_LOG = 60;

export function newRepertoireItem(tempo: number, now: number): RepertoireItem {
  return {
    attempts: 0,
    cleanRuns: 0,
    ladderTempo: tempo,
    bestCleanTempo: 0,
    box: 0,
    dueAt: now,
    lastAt: now,
    accuracy: 0,
    mastered: false,
    ladderLog: [[dayKey(new Date(now)), tempo]],
  };
}

/**
 * The log after the ladder moved to `tempo` on `day`. The starting entry is kept; any later
 * entry of the same day is replaced, so each day ends with its latest tempo. No entry when
 * the tempo did not change.
 */
export function logLadder(log: readonly LadderLogEntry[] | undefined, day: string, tempo: number): LadderLogEntry[] {
  const out = [...(log ?? [])];
  const last = out[out.length - 1];
  if (last && last[1] === tempo) return out;
  if (last && last[0] === day && out.length > 1) out[out.length - 1] = [day, tempo];
  else out.push([day, tempo]);
  return out.slice(-MAX_LADDER_LOG);
}

function clampTempo(tempo: number): number {
  return Math.round(Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, tempo)));
}

/**
 * Apply one run. Flow (with metronome): a clean run moves the ladder up by 4 bpm (in the
 * note value played) and the item to a later review; a run below 90 % moves it down and makes
 * it due again. Wait (learning) runs only count as practice.
 */
export function applyRepertoireRun(
  prev: RepertoireItem | undefined,
  run: { mode: 'wait' | 'flow' | string; accuracy: number; ladder: LadderRun },
  now: number,
): { item: RepertoireItem; change: RepertoireChange } {
  const s = run.ladder;
  const item: RepertoireItem = { ...(prev ?? newRepertoireItem(s.tempo, now)) };
  const fromTempo = item.ladderTempo;
  item.attempts++;
  item.lastAt = now;
  item.accuracy = prev ? item.accuracy * 0.6 + run.accuracy * 0.4 : run.accuracy;
  let newlyMastered = false;
  if (run.mode === 'flow') {
    const step = LADDER_STEP_BPM * s.notesPerBeat;
    if (s.clean) {
      item.cleanRuns++;
      item.bestCleanTempo = Math.max(item.bestCleanTempo, s.tempo);
      item.ladderTempo = clampTempo(Math.max(item.ladderTempo, s.tempo + step));
      item.box = Math.min(REVIEW_DAYS.length - 1, item.box + 1);
      if (!item.mastered && s.tempo >= s.goalTempo) {
        item.mastered = true;
        item.masteredAt = now;
        newlyMastered = true;
      }
    } else if (run.accuracy < 0.9) {
      item.ladderTempo = clampTempo(Math.min(item.ladderTempo, s.tempo - step));
      item.box = 0;
    }
    item.dueAt = now + REVIEW_DAYS[item.box] * DAY;
  }
  item.ladderLog = logLadder(item.ladderLog, dayKey(new Date(now)), item.ladderTempo);
  return {
    item,
    change: {
      itemId: s.itemId,
      fromTempo,
      toTempo: item.ladderTempo,
      clean: s.clean,
      newlyMastered,
      mastered: item.mastered,
      dueInDays: Math.max(0, Math.round((item.dueAt - now) / DAY)),
    },
  };
}

/** Items due for review, most overdue and least accurate first. */
export function dueItems(items: Readonly<Record<string, RepertoireItem>>, now: number): string[] {
  return Object.entries(items)
    .filter(([, it]) => it.dueAt <= now)
    .sort((a, b) => a[1].dueAt - b[1].dueAt || a[1].accuracy - b[1].accuracy)
    .map(([id]) => id);
}

/** Items that most need work: low accuracy, or stuck far below the goal tempo. */
export function weakItems(items: Readonly<Record<string, RepertoireItem>>, limit = 4): string[] {
  return Object.entries(items)
    .filter(([, it]) => it.attempts >= 2 && !it.mastered)
    .sort((a, b) => a[1].accuracy - b[1].accuracy)
    .slice(0, limit)
    .map(([id]) => id);
}

export function setLadder(item: RepertoireItem | undefined, tempo: number, now: number): RepertoireItem {
  const base = item ?? newRepertoireItem(clampTempo(tempo), now);
  const ladderTempo = clampTempo(tempo);
  return { ...base, ladderTempo, ladderLog: logLadder(base.ladderLog, dayKey(new Date(now)), ladderTempo) };
}

/** A stored log's valid entries, or a log that starts at the item's current tempo. */
function normalizeLadderLog(raw: unknown, item: RepertoireItem): LadderLogEntry[] {
  const entries = Array.isArray(raw)
    ? raw.filter((e): e is LadderLogEntry => Array.isArray(e) && isDayKey(e[0]) && typeof e[1] === 'number' && Number.isFinite(e[1]))
    : [];
  return entries.length ? entries.map(([d, t]): LadderLogEntry => [d, t]).slice(-MAX_LADDER_LOG) : [[dayKey(new Date(item.lastAt)), item.ladderTempo]];
}

/** Stored items that still make sense; anything else is dropped (no saved data to migrate yet). */
export function normalizeRepertoire(raw: unknown): Record<string, RepertoireItem> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, RepertoireItem> = {};
  for (const [id, it] of Object.entries(raw as Record<string, Partial<RepertoireItem>>)) {
    if (it && typeof it.ladderTempo === 'number' && Number.isFinite(it.ladderTempo) && typeof it.dueAt === 'number') {
      const item = { ...newRepertoireItem(it.ladderTempo, it.dueAt), ...it } as RepertoireItem;
      out[id] = { ...item, ladderLog: normalizeLadderLog(it.ladderLog, item) };
    }
  }
  return out;
}
