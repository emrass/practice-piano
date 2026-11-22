import { freshExercise } from '../../core/generator/fresh';
import { generateExercise, type FocusNote } from '../../core/generator/generator';
import { midiLabel } from '../../core/music/pitch';
import type { ProgressState } from '../../core/progress/progress';
import { findWeakFigures } from '../../core/progress/rhythm';
import { findWeakSpots } from '../../core/progress/sight';
import { generatorSettingsFrom, readAheadTicks } from '../../core/settings';
import { inputBus } from '../../input/inputBus';
import { audioEngine } from '../../platform/audio/audioEngine';
import { ExercisePanel } from '../components/ExercisePanel';
import { PracticeController } from '../practice/PracticeController';
import { generatedContinuation } from './continuation';
import { flowTiming, seenIn, stepLevel, useBuiltFor, useFocus, waitOptions } from './shared';
import type { LessonContext, LessonRuntime } from './types';

const weakNotes = (p: ProgressState): FocusNote[] => findWeakSpots(p).notes.map((n) => ({ midi: n.midi, clef: n.clef }));
const weakFigures = (p: ProgressState): string[] => findWeakFigures(p).map((w) => w.key);

/** Sight reading: fresh passages at a level, read in Wait or played in Flow. */
export function useSightLesson(ctx: LessonContext, active: boolean): LessonRuntime | null {
  const { settings: s, seed, retryToken } = ctx;
  const [focus, refreshFocus] = useFocus(ctx, weakNotes, []);
  const [figures, refreshFigures] = useFocus(ctx, weakFigures, []);
  const sight = s.sight;
  // The read-ahead cover only changes what the score shows: the passage stays.
  const { readAhead, ...shape } = sight;
  const exercise = useBuiltFor(
    // Only the fields that shape a passage (not e.g. the theme) make a new one; progress is read
    // when it is made (an unseen passage first), not followed.
    { active, ...shape, keyboardSize: s.keyboardSize, weakSpotFocus: s.weakSpotFocus, focus, figures, seed },
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
  );
  // A new session whenever the exercise, the mode or a timing setting changes, or on retry.
  const session = useBuiltFor(
    {
      exercise,
      mode: sight.mode,
      chordGraceMs: s.chordGraceMs,
      sustainScoring: s.sustainScoring,
      latencyMs: s.latencyMs,
      playheadDelayMs: s.playheadDelayMs,
      countInBars: s.countInBars,
      retryToken,
    },
    () => (exercise ? new PracticeController({ exercise, mode: sight.mode, ...waitOptions(s), ...flowTiming(s) }, inputBus, audioEngine) : null),
  );
  if (!session || !exercise) return null;
  const coverTicks = sight.mode === 'flow' ? readAheadTicks(readAhead, exercise.timeSignature) : 0;

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
    continuation: generatedContinuation('New exercise'),
    step: (direction) => stepLevel(ctx, 'sight', direction, next),
    onPatch: (patch) => {
      if (patch.weakSpotFocus) refresh();
    },
    score: { coverTicks },
    panel: <ExercisePanel settings={s} progress={ctx.progress} update={ctx.update} weakNotesLabel={weakLabel} />,
    mode: { value: sight.mode, set: (mode) => ctx.update({ sight: { mode } }) },
    focusActive: s.weakSpotFocus && focus.length > 0,
    keyboard: {
      span: exercise.range,
      // The guide would light the very keys the cover hides.
      unavailable: { guide: coverTicks ? 'Off while the read-ahead cover is on.' : undefined },
    },
    practiceWeakSpots: () => {
      refresh();
      ctx.update({ weakSpotFocus: true });
      ctx.reseed();
    },
  };
}
