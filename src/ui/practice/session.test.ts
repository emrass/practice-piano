import { describe, expect, it } from 'vitest';
import { isUntouched, type PracticeState } from './session';

const state = (patch: Partial<PracticeState> = {}): PracticeState => ({
  status: 'running',
  mode: 'wait',
  stepIndex: 0,
  expected: [60],
  revealed: [],
  countIn: null,
  beat: null,
  live: { correct: 0, wrong: 0, missed: 0, streak: 0, bestStreak: 0, accuracy: 1, timing: null },
  marks: {},
  wrong: null,
  lastGrade: null,
  result: null,
  hint: { count: 0, nudge: false },
  ...patch,
});
const live = (patch: Partial<PracticeState['live']>) => ({ live: { ...state().live, ...patch } });

describe('isUntouched', () => {
  it('a running run with nothing played is untouched', () => {
    expect(isUntouched(state())).toBe(true);
    expect(isUntouched(state({ hint: undefined }))).toBe(true);
    // Looking stuck is not the player's doing.
    expect(isUntouched(state({ hint: { count: 0, nudge: true } }))).toBe(true);
  });

  it('a correct note, a wrong note or a hint touches it', () => {
    expect(isUntouched(state(live({ correct: 1 })))).toBe(false);
    expect(isUntouched(state(live({ wrong: 1 })))).toBe(false);
    expect(isUntouched(state({ revealed: [60], hint: { count: 1, nudge: false } }))).toBe(false);
    // The hinted step was played: its keys are no longer shown, the hint still counts.
    expect(isUntouched(state({ hint: { count: 1, nudge: false } }))).toBe(false);
  });

  it('only a running run can be untouched', () => {
    expect(isUntouched(state({ status: 'ready' }))).toBe(false);
    expect(isUntouched(state({ status: 'countin' }))).toBe(false);
    expect(isUntouched(state({ status: 'finished' }))).toBe(false);
  });
});
