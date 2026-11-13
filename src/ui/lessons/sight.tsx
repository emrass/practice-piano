import { useMemo } from 'react';
import { freshExercise } from '../../core/generator/fresh';
import { generateExercise, type FocusNote } from '../../core/generator/generator';
import { midiLabel } from '../../core/music/pitch';
import { findWeakFigures, findWeakSpots, type ProgressState } from '../../core/progress/progress';
import { generatorSettingsFrom } from '../../core/settings';
import { inputBus } from '../../input/inputBus';
import { audioEngine } from '../../platform/audio/audioEngine';
import { ExercisePanel } from '../components/ExercisePanel';
import { PracticeController } from '../practice/PracticeController';
import { seenIn, stepLevel, useFocus } from './shared';
import type { LessonContext, LessonRuntime } from './types';

const weakNotes = (p: ProgressState): FocusNote[] => findWeakSpots(p).notes.map((n) => ({ midi: n.midi, clef: n.clef }));
const weakFigures = (p: ProgressState): string[] => findWeakFigures(p).map((w) => w.key);

/** Sight reading: fresh passages at a level, read in Wait or played in Flow. */
export function useSightLesson(ctx: LessonContext, active: boolean): LessonRuntime | null {
  const { settings: s, seed, retryToken } = ctx;
  const [focus, refreshFocus] = useFocus(ctx, weakNotes, []);
  const [figures, refreshFigures] = useFocus(ctx, weakFigures, []);
  const sight = s.sight;
  const exercise = useMemo(
    () =>
      active
        ? freshExercise(
            (sd) =>
              generateExercise(
                {
                  ...generatorSettingsFrom(s),
                  focus: s.weakSpotFocus ? focus : undefined,
                  // Rhythm figures are only measured in Flow mode, so only featured there.
                  focusFigures: s.weakSpotFocus && sight.mode === 'flow' ? figures : undefined,
                },
                sd,
              ),
            seed,
            seenIn(ctx.progress),
          )
        : null,
    // Only the fields that shape a passage (not e.g. the theme) make a new one; progress is read
    // when it is made (an unseen passage first), not followed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, sight, s.keyboardSize, s.weakSpotFocus, focus, figures, seed],
  );
  // A new session whenever the exercise, the mode or a timing setting changes, or on retry.
  const session = useMemo(
    () =>
      exercise
        ? new PracticeController(
            {
              exercise,
              mode: sight.mode,
              graceMs: s.chordGraceMs,
              sustainCountsAsHeld: s.sustainScoring === 'hold',
              latencyMs: s.latencyMs,
              playheadDelayMs: s.playheadDelayMs,
              metronomeVolume: s.metronomeVolume,
              countInBars: s.countInBars,
            },
            inputBus,
            audioEngine,
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exercise, sight.mode, s.chordGraceMs, s.sustainScoring, s.latencyMs, s.playheadDelayMs, s.countInBars, retryToken],
  );
  if (!session || !exercise) return null;

  const refresh = () => {
    refreshFocus();
    refreshFigures();
  };
  const next = () => {
    if (s.weakSpotFocus) refresh();
    ctx.reseed();
  };
  const weakLabel = focus.length ? focus.slice(0, 4).map((f) => midiLabel(f.midi)).join(', ') : findWeakSpots(ctx.progress).notes.length ? 'your weakest notes' : null;
  return {
    exercise,
    session,
    next,
    step: (direction) => stepLevel(ctx, 'sight', direction, next),
    onPatch: (patch) => {
      if (patch.weakSpotFocus) refresh();
    },
    panel: <ExercisePanel settings={s} progress={ctx.progress} update={ctx.update} onNew={next} weakNotesLabel={weakLabel} />,
    mode: { value: sight.mode, set: (mode) => ctx.update({ sight: { mode } }) },
    focusActive: s.weakSpotFocus && focus.length > 0,
    keyboard: { span: exercise.range, qwertyHints: true },
    practiceWeakSpots: () => {
      refresh();
      ctx.update({ weakSpotFocus: true });
      ctx.reseed();
    },
  };
}
