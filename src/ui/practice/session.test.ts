import { describe, expect, it } from 'vitest';
import { isIdle, isUntouched, type PracticeState } from './session';

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

describe('isIdle', () => {
  it('a run that has not started or has finished is idle', () => {
    expect(isIdle(state({ status: 'ready' }))).toBe(true);
    expect(isIdle(state({ status: 'finished' }))).toBe(true);
    expect(isIdle(state({ status: 'ready', mode: 'flow' }))).toBe(true);
  });

  it('a Wait run with nothing played yet is idle, one that was played in is not', () => {
    expect(isIdle(state())).toBe(true);
    expect(isIdle(state(live({ wrong: 1 })))).toBe(false);
    expect(isIdle(state({ hint: { count: 1, nudge: false } }))).toBe(false);
  });

  it('a count-in or a moving Flow or rhythm run is never idle', () => {
    expect(isIdle(state({ status: 'countin', mode: 'flow' }))).toBe(false);
    expect(isIdle(state({ status: 'countin' }))).toBe(false);
    expect(isIdle(state({ mode: 'flow' }))).toBe(false);
  });

  it('ear training is busy while a phrase plays or once it was heard', () => {
    const ear = (patch: Partial<NonNullable<PracticeState['ear']>>) => ({ ear: { playing: false, listened: false, replays: 0, hints: 0, ...patch } });
    expect(isIdle(state({ status: 'ready', mode: 'ear', ...ear({}) }))).toBe(true);
    expect(isIdle(state({ status: 'running', mode: 'ear', ...ear({ playing: true, listened: true }) }))).toBe(false);
    expect(isIdle(state({ status: 'running', mode: 'ear', ...ear({ listened: true }) }))).toBe(false);
    expect(isIdle(state({ status: 'finished', mode: 'ear', ...ear({ playing: true, listened: true }) }))).toBe(false);
  });
});
