import { useMemo, useState } from 'react';
import { chordItemId, type ChordItem, type ChordQuality, chordSpelling, findProgression, keysFor, parseChordItemId, PROGRESSIONS } from '../../core/chords/catalog';
import { type ChordFocus, generateChordExercise, initialChordBpm } from '../../core/chords/generator';
import { findWeakChords } from '../../core/progress/chords';
import type { ProgressState } from '../../core/progress/progress';
import { inputBus } from '../../input/inputBus';
import { audioEngine } from '../../platform/audio/audioEngine';
import { ChordChart } from '../components/ChordChart';
import { ChordsPanel } from '../components/ChordsPanel';
import { ChordController } from '../practice/ChordController';
import { generatedContinuation, repertoireContinuation } from './continuation';
import { flowTiming, randomFrom, reviewView, useBuiltFor, useFocus, useRepertoire } from './shared';
import type { LessonContext, LessonRuntime } from './types';

const isChordItem = (id: string) => parseChordItemId(id) !== null;

/** Drill weighting from the chord qualities, roots and inversions you miss or find slowly. */
function weakChordFocus(progress: ProgressState): ChordFocus {
  const focus: Required<ChordFocus> = { qualities: {}, roots: {} };
  for (const w of findWeakChords(progress)) {
    const weight = Math.min(4, 1 + 2 * w.score);
    if (w.dimension === 'chordQuality') focus.qualities[w.key as ChordQuality] = weight;
    if (w.dimension === 'chordRoot') focus.roots[Number(w.key)] = weight;
  }
  return focus;
}

const keysOf = (progression: string) => keysFor((findProgression(progression) ?? PROGRESSIONS[0]).mode);

/** Chords & progressions: chord drills and progressions in all keys, on a tempo ladder. */
export function useChordsLesson(ctx: LessonContext, active: boolean): LessonRuntime | null {
  const { settings: s, seed, retryToken } = ctx;
  const c = s.chords;
  const rep = useRepertoire(ctx, isChordItem);
  const [shuffleKey, setShuffleKey] = useState<string | null>(null);
  const [focus, refreshFocus] = useFocus(ctx, weakChordFocus, {});

  const item: ChordItem | null = useMemo(() => {
    if (!active) return null;
    const picked = c.source === 'review' && rep.reviewPick ? parseChordItemId(rep.reviewPick) : null;
    if (picked) return picked;
    if (c.task === 'drill') return { task: 'drill', set: c.set, prompt: c.prompt, inversions: c.inversions };
    const def = findProgression(c.progression) ?? PROGRESSIONS[0];
    const keys = keysFor(def.mode);
    const key = c.key === 'shuffle' ? (shuffleKey && keys.includes(shuffleKey) ? shuffleKey : keys[0]) : c.key;
    return { task: 'progression', progression: def.id, key, hands: c.hands };
  }, [active, c.source, c.task, c.set, c.prompt, c.inversions, c.progression, c.key, c.hands, rep.reviewPick, shuffleKey]);

  const drillFocus = s.weakSpotFocus && item?.task === 'drill' ? focus : undefined;
  const exercise = useBuiltFor(
    // Ladder tempo read when the exercise is made, as for scales.
    { item, count: c.count, drillFocus, seed, retryToken, ladderToken: rep.ladderToken },
    () => {
      if (!item) return null;
      const bpm = ctx.progress.repertoire[chordItemId(item)]?.ladderTempo ?? initialChordBpm(item);
      return generateChordExercise(item, { bpm, count: c.count, focus: drillFocus }, seed);
    },
  );
  // Keys and held notes are spelled as the chord asked for spells them (D♭7 shows C♭, not B).
  const spellings = useMemo(() => exercise?.chords.targets.map((t) => chordSpelling(t.spec)) ?? [], [exercise]);
  // A new session whenever the exercise, the mode or a timing setting changes, or on retry.
  const session = useBuiltFor(
    { exercise, mode: c.mode, goalBpm: c.goalBpm, latencyMs: s.latencyMs, playheadDelayMs: s.playheadDelayMs, countInBars: s.countInBars, retryToken },
    () => (exercise ? new ChordController({ exercise, mode: c.mode, goalBpm: c.goalBpm, ...flowTiming(s) }, inputBus, audioEngine) : null),
  );
  if (!session || !item || !exercise) return null;

  // A due item is on screen: the panel shows it, and editing it goes back to picking from it.
  const reviewing = c.source === 'review' && rep.reviewPick === chordItemId(item);
  const view = reviewView(s, ctx.update, 'chords', reviewing ? item : null);
  const next = () => {
    if (s.weakSpotFocus) refreshFocus();
    if (c.source === 'review') rep.pickNext(chordItemId(item));
    else if (item.task === 'progression' && c.key === 'shuffle') setShuffleKey(randomFrom(keysOf(item.progression), item.key));
    ctx.reseed();
  };
  // A drill is generated material; a progression is repertoire ("Again" is at the new tempo once a run moved the ladder).
  const review = c.source === 'review';
  const ladderBpm = ctx.progress.repertoire[exercise.chords.itemId]?.ladderTempo ?? exercise.chords.bpm;
  const continuation =
    item.task === 'drill' && !review
      ? generatedContinuation('New chords')
      : repertoireContinuation({ review, shuffle: c.key === 'shuffle', movedToBpm: ladderBpm === exercise.chords.bpm ? undefined : ladderBpm });
  const tempo = (deltaBpm: number) => rep.changeTempo({ itemId: exercise.chords.itemId, tempo: exercise.chords.bpm, notesPerBeat: 1 }, deltaBpm);
  // Drills by symbol (the staff would give the answer away) and progressions from the chart.
  const chart = item.task === 'drill' ? item.prompt === 'symbol' : !c.notation;
  return {
    exercise,
    session,
    next,
    continuation,
    step: (direction) => tempo(4 * direction),
    onPatch: (patch) => {
      if (patch.weakSpotFocus) refreshFocus();
      const p = patch.chords;
      if (!p) return;
      if (p.source === 'review') rep.pickNext(null);
      if (p.key === 'shuffle') setShuffleKey(randomFrom(keysOf(p.progression ?? c.progression), null));
    },
    panel: (
      <ChordsPanel
        settings={view.settings}
        progress={ctx.progress}
        update={view.update}
        exercise={exercise}
        onTempo={tempo}
        dueCount={rep.dueCount}
        now={ctx.now}
        weak={findWeakChords(ctx.progress)}
        reviewing={reviewing}
      />
    ),
    stage: chart ? (session) => <ChordChart exercise={exercise} controller={session} /> : undefined,
    mode: { value: c.mode, set: (mode) => ctx.update({ chords: { mode } }) },
    focusActive: !!drillFocus && Object.keys({ ...drillFocus.qualities, ...drillFocus.roots }).length > 0,
    keyboard: {
      span: exercise.range,
      spelling: (st) => spellings[st.chords?.index ?? 0],
      unavailable: {
        guide: item.task === 'drill' ? `In a drill the chord is the question${c.mode === 'wait' ? ' — press ? for a hint' : ''}` : undefined,
      },
    },
    review: () => {
      ctx.update({ chords: { source: 'review' } });
      ctx.reseed();
    },
    practiceWeakSpots: () => {
      refreshFocus();
      ctx.update({ weakSpotFocus: true, chords: { task: 'drill', source: 'pick' } });
      ctx.reseed();
    },
  };
}
