import { useMemo, useState } from 'react';
import { scaleResult } from '../../core/scales/analysis';
import { itemId, parseItemId, SCALE_TYPES, type ScaleItem } from '../../core/scales/catalog';
import { generateScaleExercise, initialNpm, type ScaleExercise } from '../../core/scales/generator';
import { inputBus } from '../../input/inputBus';
import { audioEngine } from '../../platform/audio/audioEngine';
import { MemoryCard } from '../components/MemoryCard';
import { ScalesPanel } from '../components/ScalesPanel';
import { PracticeController } from '../practice/PracticeController';
import { randomFrom, reviewView, useRepertoire } from './shared';
import type { LessonContext, LessonRuntime } from './types';

const isScaleItem = (id: string) => parseItemId(id) !== null;

/** Scales & arpeggios: a fixed repertoire on a tempo ladder, with spaced review. */
export function useScalesLesson(ctx: LessonContext, active: boolean): LessonRuntime | null {
  const { settings: s, seed, retryToken } = ctx;
  const sc = s.scales;
  const rep = useRepertoire(ctx, isScaleItem);
  const [shuffleTonic, setShuffleTonic] = useState<string | null>(null);

  const item: ScaleItem | null = useMemo(() => {
    if (!active) return null;
    const picked = sc.source === 'review' && rep.reviewPick ? parseItemId(rep.reviewPick) : null;
    if (picked) return picked;
    const def = SCALE_TYPES[sc.type];
    const tonic = sc.tonic === 'shuffle' ? (shuffleTonic && def.tonics.includes(shuffleTonic) ? shuffleTonic : def.tonics[0]) : sc.tonic;
    return { type: sc.type, tonic, hands: sc.hands };
  }, [active, sc.source, sc.type, sc.tonic, sc.hands, rep.reviewPick, shuffleTonic]);

  const exercise: ScaleExercise | null = useMemo(
    () => {
      if (!item) return null;
      // The ladder tempo is read when the exercise is made (not on every progress change, so the
      // results of a run stay on screen); retries and tempo changes make a new one.
      const npm = ctx.progress.repertoire[itemId(item)]?.ladderTempo ?? initialNpm(item, sc.noteValue);
      return generateScaleExercise(item, { octaves: sc.octaves, noteValue: sc.noteValue, npm });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [item, sc.octaves, sc.noteValue, seed, retryToken, rep.ladderToken],
  );
  // A new session whenever the exercise, the mode or a timing setting changes, or on retry.
  const session = useMemo(
    () =>
      exercise
        ? new PracticeController(
            {
              exercise,
              mode: sc.mode,
              decorate: (raw) => scaleResult(exercise, raw, sc.goalNps * 60),
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
    [exercise, sc.mode, sc.goalNps, s.chordGraceMs, s.sustainScoring, s.latencyMs, s.playheadDelayMs, s.countInBars, retryToken],
  );
  if (!session || !item || !exercise) return null;

  // A due item is on screen: the panel shows it, and editing it goes back to picking from it.
  const reviewing = sc.source === 'review' && rep.reviewPick === itemId(item);
  const view = reviewView(s, ctx.update, 'scales', reviewing ? { type: item.type, tonic: item.tonic, hands: item.hands } : null);
  const next = () => {
    if (sc.source === 'review') rep.pickNext(itemId(item));
    else if (sc.tonic === 'shuffle') setShuffleTonic(randomFrom(SCALE_TYPES[sc.type].tonics, item.tonic));
    ctx.reseed();
  };
  const tempo = (deltaBpm: number) =>
    rep.changeTempo({ itemId: exercise.scale.itemId, tempo: exercise.scale.npm, notesPerBeat: exercise.scale.notesPerBeat }, deltaBpm);
  return {
    exercise,
    session,
    next,
    step: (direction) => tempo(4 * direction),
    onPatch: (patch) => {
      const p = patch.scales;
      if (!p) return;
      if (p.source === 'review') rep.pickNext(null);
      if (p.tonic === 'shuffle') setShuffleTonic(randomFrom(SCALE_TYPES[p.type ?? sc.type].tonics, null));
      if (p.type && sc.tonic === 'shuffle') setShuffleTonic(randomFrom(SCALE_TYPES[p.type].tonics, null));
    },
    panel: (
      <ScalesPanel
        settings={view.settings}
        progress={ctx.progress}
        update={view.update}
        onNew={next}
        exercise={exercise}
        onTempo={tempo}
        dueCount={rep.dueCount}
        now={ctx.now}
        reviewing={reviewing}
      />
    ),
    stage: sc.notation ? undefined : (session) => <MemoryCard exercise={exercise} session={session} />,
    score: { showFingering: sc.showFingering },
    mode: { value: sc.mode, set: (mode) => ctx.update({ scales: { mode } }) },
    focusActive: false,
    keyboard: { span: exercise.range, qwertyHints: true },
    review: () => {
      ctx.update({ scales: { source: 'review' } });
      ctx.reseed();
    },
    practiceWeakSpots: () => {
      ctx.update({ weakSpotFocus: true });
      ctx.reseed();
    },
  };
}
