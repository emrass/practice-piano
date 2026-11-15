// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LessonId } from '../../core/lessons';
import { emptyProgress, type ProgressState } from '../../core/progress/progress';
import { setLadder } from '../../core/repertoire/repertoire';
import type { ScaleExercise } from '../../core/scales/generator';
import { applySettingsPatch, DEFAULT_SETTINGS, type SettingsPatch } from '../../core/settings';
import { useLesson, type LessonContext } from './index';

function context(lesson: LessonId): LessonContext {
  const progress = emptyProgress();
  return {
    settings: { ...DEFAULT_SETTINGS, lesson },
    progress,
    progressRef: { current: progress },
    setProgress: () => {},
    update: () => {},
    seed: 1,
    reseed: () => {},
    retryToken: 0,
    armAutoStart: () => {},
    now: 0,
  };
}

function setup(lesson: LessonId) {
  let ctx = context(lesson);
  const hook = renderHook((c: LessonContext) => useLesson(lesson, c), { initialProps: ctx });
  const change = (next: Partial<LessonContext>) => {
    ctx = { ...ctx, ...next };
    hook.rerender(ctx);
    return hook.result.current;
  };
  return {
    runtime: () => hook.result.current,
    change,
    patch: (patch: SettingsPatch) => change({ settings: applySettingsPatch(ctx.settings, patch) }),
    progress: (progress: ProgressState) => change({ progress, progressRef: { current: progress } }),
  };
}

const LESSON_IDS: LessonId[] = ['sight', 'ear', 'rhythm', 'scales', 'chords'];

describe.each(LESSON_IDS)('the %s lesson', (lesson) => {
  it('keeps the exercise and its session when a setting that does not shape them changes', () => {
    const { runtime, patch } = setup(lesson);
    const { exercise, session } = runtime();
    // The metronome volume is applied to the running session, not by making a new one.
    for (const p of [{ theme: 'dark' }, { metronomeVolume: 0.2 }, { showKeyboardGuide: false }] as const) patch(p);
    expect(runtime().exercise).toBe(exercise);
    expect(runtime().session).toBe(session);
  });

  it("keeps the exercise on screen when a finished run's results arrive", () => {
    const { runtime, progress } = setup(lesson);
    const { exercise, session } = runtime();
    progress({ ...emptyProgress(), attempts: { [exercise.id]: 1 }, exercisesCompleted: 1 });
    expect(runtime().exercise).toBe(exercise);
    expect(runtime().session).toBe(session);
  });

  it('makes a new session on retry, and a new exercise and session for a new seed', () => {
    const { runtime, change } = setup(lesson);
    const first = runtime();
    expect(change({ retryToken: 1 }).session).not.toBe(first.session);
    const reseeded = change({ seed: 2 });
    expect(reseeded.exercise).not.toBe(first.exercise);
    expect(reseeded.session).not.toBe(first.session);
  });
});

describe('a level lesson', () => {
  it('makes a new exercise when a field that shapes it changes, and a new session for a timing setting', () => {
    const { runtime, patch } = setup('sight');
    const first = runtime();
    const timed = patch({ latencyMs: DEFAULT_SETTINGS.latencyMs + 10 });
    expect(timed.exercise).toBe(first.exercise);
    expect(timed.session).not.toBe(first.session);
    expect(patch({ sight: { level: DEFAULT_SETTINGS.sight.level + 1 } }).exercise).not.toBe(first.exercise);
  });
});

describe('a repertoire lesson', () => {
  it('reads the ladder tempo when the exercise is made, not when a run moves it', () => {
    const { runtime, progress, change } = setup('scales');
    const exercise = runtime().exercise as ScaleExercise;
    const moved = setLadder(undefined, exercise.scale.npm + 8, 0);
    progress({ ...emptyProgress(), repertoire: { [exercise.scale.itemId]: moved } });
    expect(runtime().exercise).toBe(exercise);
    const retried = change({ retryToken: 1 }).exercise as ScaleExercise;
    expect(retried.scale.npm).toBe(moved.ladderTempo);
    expect(retried.scale.npm).not.toBe(exercise.scale.npm);
  });
});
