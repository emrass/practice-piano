import { useMemo } from 'react';
import { generateEarExercise } from '../../core/ear/generator';
import { freshExercise } from '../../core/generator/fresh';
import { findWeakIntervals, type ProgressState } from '../../core/progress/progress';
import { inputBus } from '../../input/inputBus';
import { audioEngine } from '../../platform/audio/audioEngine';
import { EarPanel } from '../components/EarPanel';
import { EarController } from '../practice/EarController';
import { seenIn, stepLevel, useFocus } from './shared';
import type { LessonContext, LessonRuntime } from './types';

const weakIntervals = (p: ProgressState): number[] => findWeakIntervals(p).map((w) => w.semitones);

/** Ear training: hear a phrase, play it back. */
export function useEarLesson(ctx: LessonContext, active: boolean): LessonRuntime | null {
  const { settings: s, seed, retryToken } = ctx;
  const [focus, refreshFocus] = useFocus(ctx, weakIntervals, []);
  const exercise = useMemo(
    () =>
      active
        ? freshExercise((sd) => generateEarExercise({ ...s.ear, focusIntervals: s.weakSpotFocus ? focus : undefined }, sd), seed, seenIn(ctx.progress))
        : null,
    // Progress is read when the phrase is made, not followed (the finished phrase stays on screen).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, s.ear, s.weakSpotFocus, focus, seed],
  );
  // A new session whenever the exercise, the mode or a timing setting changes, or on retry.
  const session = useMemo(
    () =>
      exercise
        ? new EarController(
            { exercise, graceMs: s.chordGraceMs, sustainCountsAsHeld: s.sustainScoring === 'hold', volume: s.synthVolume },
            inputBus,
            audioEngine,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exercise, s.chordGraceMs, s.sustainScoring, s.synthVolume, retryToken],
  );
  if (!session || !exercise) return null;

  const next = () => {
    if (s.weakSpotFocus) refreshFocus();
    ctx.armAutoStart();
    ctx.reseed();
  };
  return {
    exercise,
    session,
    next,
    step: (direction) => stepLevel(ctx, 'ear', direction, next),
    onPatch: (patch) => {
      if (patch.weakSpotFocus) refreshFocus();
    },
    panel: (
      <EarPanel
        settings={s}
        progress={ctx.progress}
        update={ctx.update}
        onNew={next}
        weakIntervals={focus.length ? focus : weakIntervals(ctx.progress)}
      />
    ),
    focusActive: s.weakSpotFocus && focus.length > 0,
    // The keyboard must not give the phrase away, so its window is fixed (C3–C6).
    keyboard: {
      span: { min: 48, max: 84 },
      unavailable: { guide: 'Ear training never shows the answer on the keys — press ? for a hint' },
      fitLabel: 'Compact (C3–C6)',
    },
    practiceWeakSpots: () => {
      refreshFocus();
      ctx.update({ weakSpotFocus: true });
      ctx.reseed();
    },
    autoStart: true,
  };
}
