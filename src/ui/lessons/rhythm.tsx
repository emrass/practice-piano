import { useMemo } from 'react';
import { freshExercise } from '../../core/generator/fresh';
import type { ProgressState } from '../../core/progress/progress';
import { findWeakFigures } from '../../core/progress/rhythm';
import { generateRhythmExercise } from '../../core/rhythm/generator';
import { inputBus } from '../../input/inputBus';
import { audioEngine } from '../../platform/audio/audioEngine';
import { RhythmPanel } from '../components/RhythmPanel';
import { RhythmController } from '../practice/RhythmController';
import { generatedContinuation } from './continuation';
import { flowTiming, seenIn, stepLevel, useBuiltFor, useFocus } from './shared';
import type { LessonContext, LessonRuntime } from './types';

const weakFigures = (p: ProgressState): string[] => findWeakFigures(p).map((w) => w.key);

/** Rhythm: tap rhythms on two designated keys (read, echo, keep the pulse). */
export function useRhythmLesson(ctx: LessonContext, active: boolean): LessonRuntime | null {
  const { settings: s, seed, retryToken } = ctx;
  const [focus, refreshFocus] = useFocus(ctx, weakFigures, []);
  const exercise = useBuiltFor(
    // Progress is read when the rhythm is made, not followed (the finished one stays on screen).
    { active, rhythm: s.rhythm, weakSpotFocus: s.weakSpotFocus, focus, seed },
    () =>
      active
        ? freshExercise((sd) => generateRhythmExercise({ ...s.rhythm, focusFigures: s.weakSpotFocus ? focus : undefined }, sd), seed, seenIn(ctx.progress))
        : null,
  );
  // J taps the right-hand key, F the left (either one when only one hand plays).
  const keys = useMemo(() => {
    if (!exercise) return null;
    const { rhKey, lhKey } = exercise.rhythm;
    const usesLh = exercise.measures.some((m) => m.lh.length);
    const usesRh = exercise.measures.some((m) => m.rh.length);
    const qwerty = new Map([
      ['KeyJ', usesRh ? rhKey : lhKey],
      ['KeyF', usesLh ? lhKey : rhKey],
    ]);
    const markers = new Map<number, string>([...(usesLh ? [[lhKey, 'LH · F'] as const] : []), ...(usesRh ? [[rhKey, 'RH · J'] as const] : [])]);
    return { qwerty, markers };
  }, [exercise]);
  // A new session whenever the exercise, the mode or a timing setting changes, or on retry.
  const session = useBuiltFor(
    { exercise, latencyMs: s.latencyMs, playheadDelayMs: s.playheadDelayMs, countInBars: s.countInBars, synthVolume: s.synthVolume, retryToken },
    () => (exercise ? new RhythmController({ exercise, ...flowTiming(s), synthVolume: s.synthVolume }, inputBus, audioEngine) : null),
  );
  if (!session || !exercise || !keys) return null;

  const next = () => {
    if (s.weakSpotFocus) refreshFocus();
    ctx.reseed();
  };
  const { rhKey, lhKey } = s.rhythm;
  return {
    exercise,
    session,
    next,
    continuation: generatedContinuation('New rhythm'),
    step: (direction) => stepLevel(ctx, 'rhythm', direction, next),
    onPatch: (patch) => {
      if (patch.weakSpotFocus) refreshFocus();
    },
    panel: <RhythmPanel settings={s} progress={ctx.progress} update={ctx.update} weakFigures={findWeakFigures(ctx.progress)} />,
    focusActive: s.weakSpotFocus && focus.length > 0,
    keyboard: {
      span: { min: Math.min(lhKey, rhKey), max: Math.max(lhKey, rhKey) },
      qwerty: keys.qwerty,
      markers: keys.markers,
      unavailable: {
        guide: exercise.rhythm.task === 'echo' ? 'Echo: you play back what you heard, so the keys stay dark' : undefined,
        qwertyHints: 'Rhythm uses J and F, marked on its two keys',
      },
    },
    practiceWeakSpots: () => {
      refreshFocus();
      ctx.update({ weakSpotFocus: true });
      ctx.reseed();
    },
  };
}
