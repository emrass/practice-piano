import { generateEarExercise } from '../../core/ear/generator';
import { freshExercise } from '../../core/generator/fresh';
import { findWeakIntervals } from '../../core/progress/ear';
import type { ProgressState } from '../../core/progress/progress';
import { inputBus } from '../../input/inputBus';
import { audioEngine } from '../../platform/audio/audioEngine';
import { EarPanel } from '../components/EarPanel';
import { EarController } from '../practice/EarController';
import { generatedContinuation } from './continuation';
import { seenIn, stepLevel, useBuiltFor, useFocus, waitOptions } from './shared';
import type { LessonContext, LessonRuntime } from './types';

const weakIntervals = (p: ProgressState): number[] => findWeakIntervals(p).map((w) => w.semitones);

/** Ear training: hear a phrase, play it back. */
export function useEarLesson(ctx: LessonContext, active: boolean): LessonRuntime | null {
  const { settings: s, seed, retryToken } = ctx;
  const [focus, refreshFocus] = useFocus(ctx, weakIntervals, []);
  const exercise = useBuiltFor(
    // Progress is read when the phrase is made, not followed (the finished phrase stays on screen).
    { active, ear: s.ear, weakSpotFocus: s.weakSpotFocus, focus, seed },
    () =>
      active
        ? freshExercise((sd) => generateEarExercise({ ...s.ear, focusIntervals: s.weakSpotFocus ? focus : undefined }, sd), seed, seenIn(ctx.progress))
        : null,
  );
  // A new session whenever the exercise, the mode or a timing setting changes, or on retry.
  const session = useBuiltFor(
    { exercise, chordGraceMs: s.chordGraceMs, sustainScoring: s.sustainScoring, synthVolume: s.synthVolume, retryToken },
    () => (exercise ? new EarController({ exercise, ...waitOptions(s), volume: s.synthVolume }, inputBus, audioEngine) : null),
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
    continuation: generatedContinuation('New phrase'),
    step: (direction) => stepLevel(ctx, 'ear', direction, next),
    onPatch: (patch) => {
      if (patch.weakSpotFocus) refreshFocus();
    },
    panel: (
      <EarPanel
        settings={s}
        progress={ctx.progress}
        update={ctx.update}
        weakIntervals={focus.length ? focus : weakIntervals(ctx.progress)}
      />
    ),
    focusActive: s.weakSpotFocus && focus.length > 0,
    // The keyboard must not give the phrase away, so its window is fixed (C3–C6).
    keyboard: {
      span: { min: 48, max: 84 },
      unavailable: { guide: 'Off in ear training: find the notes by ear. Press ? for a hint.' },
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
