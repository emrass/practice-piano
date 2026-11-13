
/**
 * Per-item progress for fixed-repertoire lessons (DIDACTICS §2): a tempo ladder instead of a
 * level, mastery at a goal tempo, and spaced review (Leitner boxes) so weak or old items
 * come back sooner. Pure functions; stored in ProgressState.repertoire.
 */
export interface RepertoireItem {
  attempts: number;
  cleanRuns: number;
  /** Current ladder tempo: notes per minute (scales) or bpm (chords). */
  ladderNpm: number;
  bestCleanNpm: number;
  /** Leitner box 0–5: the review interval doubles with each clean run. */
  box: number;
  dueAt: number;
  lastAt: number;
  /** Rolling accuracy (exponential average). */
  accuracy: number;
  mastered: boolean;
  masteredAt?: number;
}

export interface RepertoireChange {
  itemId: string;
  fromNpm: number;
  toNpm: number;
  clean: boolean;
  newlyMastered: boolean;
  mastered: boolean;
  dueInDays: number;
}

/** What a run tells the ladder. Scales count notes per minute; chords count beats per minute (one chord per bar). */
export interface LadderRun {
  itemId: string;
  npm: number;
  /** Ladder step = 4 bpm × this (notes per beat; 1 for chords). */
  notesPerBeat: number;
  goalNpm: number;
  clean: boolean;
}

const DAY = 24 * 60 * 60 * 1000;
/** Review interval (days) per box. Box 0 = due again today. */
export const REVIEW_DAYS = [0, 1, 2, 4, 8, 16] as const;
export const LADDER_STEP_BPM = 4;
export const MIN_NPM = 30;
export const MAX_NPM = 960;

export function newRepertoireItem(npm: number, now: number): RepertoireItem {
  return { attempts: 0, cleanRuns: 0, ladderNpm: npm, bestCleanNpm: 0, box: 0, dueAt: now, lastAt: now, accuracy: 0, mastered: false };
}

function clampNpm(npm: number): number {
  return Math.round(Math.min(MAX_NPM, Math.max(MIN_NPM, npm)));
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
  const item: RepertoireItem = { ...(prev ?? newRepertoireItem(s.npm, now)) };
  const fromNpm = item.ladderNpm;
  item.attempts++;
  item.lastAt = now;
  item.accuracy = prev ? item.accuracy * 0.6 + run.accuracy * 0.4 : run.accuracy;
  let newlyMastered = false;
  if (run.mode === 'flow') {
    const step = LADDER_STEP_BPM * s.notesPerBeat;
    if (s.clean) {
      item.cleanRuns++;
      item.bestCleanNpm = Math.max(item.bestCleanNpm, s.npm);
      item.ladderNpm = clampNpm(Math.max(item.ladderNpm, s.npm + step));
      item.box = Math.min(REVIEW_DAYS.length - 1, item.box + 1);
      if (!item.mastered && s.npm >= s.goalNpm) {
        item.mastered = true;
        item.masteredAt = now;
        newlyMastered = true;
      }
    } else if (run.accuracy < 0.9) {
      item.ladderNpm = clampNpm(Math.min(item.ladderNpm, s.npm - step));
      item.box = 0;
    }
    item.dueAt = now + REVIEW_DAYS[item.box] * DAY;
  }
  return {
    item,
    change: {
      itemId: s.itemId,
      fromNpm,
      toNpm: item.ladderNpm,
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

export function setLadder(item: RepertoireItem | undefined, npm: number, now: number): RepertoireItem {
  return { ...(item ?? newRepertoireItem(npm, now)), ladderNpm: clampNpm(npm) };
}
