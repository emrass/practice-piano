import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Exercise } from '../core/exercise';
import type { ExerciseResult } from '../core/eval/types';
import { chordItemId, type ChordItem, type ChordQuality, findProgression, keysFor, parseChordItemId, PROGRESSIONS } from '../core/chords/catalog';
import { type ChordExercise, type ChordFocus, generateChordExercise, initialChordBpm } from '../core/chords/generator';
import { generateEarExercise, type EarExercise } from '../core/ear/generator';
import { generateExercise, type FocusNote } from '../core/generator/generator';
import { LESSONS, type LessonId } from '../core/lessons';
import { randomSeed } from '../core/generator/rng';
import { PIANO_ACTIONS, type PianoAction, PianoShortcutGate } from '../core/input/pianoShortcuts';
import { clampQwertyBase, OCTAVE_DOWN_CODE, OCTAVE_UP_CODE, qwertyBaseFor, qwertyToMidi } from '../core/input/qwerty';
import { fitKeyboardRange, KEYBOARD_RANGES } from '../core/keyboard/range';
import { prefersFlats } from '../core/music/keys';
import { midiLabel } from '../core/music/pitch';
import {
  applyResult,
  type Award,
  dayKey,
  displayStreak,
  findWeakChords,
  findWeakFigures,
  findWeakIntervals,
  findWeakSpots,
  type ProgressState,
} from '../core/progress/progress';
import { generateRhythmExercise, type RhythmExercise } from '../core/rhythm/generator';
import { scaleResult } from '../core/scales/analysis';
import { itemId, parseItemId, SCALE_TYPES, type ScaleItem } from '../core/scales/catalog';
import { generateScaleExercise, initialNpm, type ScaleExercise } from '../core/scales/generator';
import { dueItems, setLadder } from '../core/repertoire/repertoire';
import { earSettingsFrom, rhythmSettingsFrom, type Settings } from '../core/settings';
import { useStore } from '../lib/store';
import { inputBus } from '../input/inputBus';
import { KeySound } from '../input/keySound';
import { audioEngine } from '../platform/audio/audioEngine';
import { MidiService } from '../platform/midi/midiService';
import { isNativeApp } from '../platform/native';
import { Segmented } from './components/controls';
import { EarPanel } from './components/EarPanel';
import { ExercisePanel } from './components/ExercisePanel';
import { InputAudioPanel, InputMonitor } from './components/InputAudioPanel';
import { LatencyCalibration } from './components/LatencyCalibration';
import { MetaStrip } from './components/MetaStrip';
import { PianoKeyboard } from './components/PianoKeyboard';
import { PracticeBar } from './components/PracticeBar';
import { ProgressPanel } from './components/ProgressPanel';
import { ResultsCard } from './components/ResultsCard';
import { ScoreView } from './components/ScoreView';
import { EarController } from './practice/EarController';
import { PracticeController } from './practice/PracticeController';
import { RhythmController } from './practice/RhythmController';
import { RhythmPanel } from './components/RhythmPanel';
import { ScalesPanel } from './components/ScalesPanel';
import { ChordChart } from './components/ChordChart';
import { ChordsPanel } from './components/ChordsPanel';
import { ChordController } from './practice/ChordController';
import type { Session } from './practice/session';
import { type Profile, useProfile } from './state/useProfile';

const midiService = new MidiService(inputBus);

type Tab = 'exercise' | 'input' | 'progress';

function weakFocus(progress: ProgressState): FocusNote[] {
  return findWeakSpots(progress).notes.map((n) => ({ midi: n.midi, clef: n.clef }));
}

function weakIntervalFocus(progress: ProgressState): number[] {
  return findWeakIntervals(progress).map((w) => w.semitones);
}

function weakFigureFocus(progress: ProgressState): string[] {
  return findWeakFigures(progress).map((w) => w.key);
}

/** Scale items due for review, most overdue first. */
function dueScaleItems(progress: ProgressState, now: number): string[] {
  return dueItems(progress.repertoire, now).filter((id) => parseItemId(id) !== null);
}

/** Chord items due for review, most overdue first. */
function dueChordItems(progress: ProgressState, now: number): string[] {
  return dueItems(progress.repertoire, now).filter((id) => parseChordItemId(id) !== null);
}

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

function randomTonic(tonics: readonly string[], not: string | null): string {
  const pool = tonics.filter((t) => t !== not);
  return pool[Math.floor(Math.random() * pool.length)] ?? tonics[0];
}

/** Optional sound for the on-screen and computer keys (MIDI pianos make their own). */
const keySound = new KeySound(audioEngine);

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t.isContentEditable;
}

export function App() {
  const profile = useProfile();
  if (!profile.ready) {
    return (
      <div className="splash">
        <span className="brand-mark" aria-hidden="true" />
        Loading your studio…
      </div>
    );
  }
  return <Studio profile={profile} />;
}

function Studio({ profile }: { profile: Profile }) {
  const { settings: s, progress, updateSettings, setProgress } = profile;
  const [seed, setSeed] = useState(randomSeed);
  const [focus, setFocus] = useState<FocusNote[]>(() => (s.weakSpotFocus ? weakFocus(progress) : []));
  const [focusIntervals, setFocusIntervals] = useState<number[]>(() => (s.weakSpotFocus ? weakIntervalFocus(progress) : []));
  const [focusFigures, setFocusFigures] = useState<string[]>(() => (s.weakSpotFocus ? weakFigureFocus(progress) : []));
  const lesson: LessonId = s.lesson;
  const [retryToken, setRetryToken] = useState(0);
  // Scales: shuffled key, the item picked from the review queue, and manual ladder changes.
  const [shuffleTonic, setShuffleTonic] = useState<string | null>(null);
  const [reviewPick, setReviewPick] = useState<string | null>(() => dueScaleItems(progress, Date.now())[0] ?? null);
  // Chords: the same for progressions (key shuffle) and the chord review queue.
  const [shuffleChordKey, setShuffleChordKey] = useState<string | null>(null);
  const [chordReviewPick, setChordReviewPick] = useState<string | null>(() => dueChordItems(progress, Date.now())[0] ?? null);
  const [chordFocus, setChordFocus] = useState<ChordFocus>(() => (s.weakSpotFocus ? weakChordFocus(progress) : {}));
  const [ladderToken, setLadderToken] = useState(0);
  const [tab, setTab] = useState<Tab>('exercise');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [award, setAward] = useState<{ exerciseId: string; award: Award } | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [hiddenResultsFor, setHiddenResultsFor] = useState<object | null>(null);
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // ---- Exercise -------------------------------------------------------------------
  const sightExercise: Exercise | null = useMemo(
    () =>
      lesson !== 'sight'
        ? null
        : generateExercise(
        {
          level: s.level,
          hands: s.hands,
          bars: s.bars,
          keyId: s.keyId,
          timeSignature: s.timeSignature,
          rhythmComplexity: s.rhythmComplexity,
          maxPolyphony: s.maxPolyphony,
          bpm: s.bpm,
          keyboardSize: s.keyboardSize,
          focus: s.weakSpotFocus ? focus : undefined,
          // Rhythm figures are only measured in Flow mode, so only featured there.
          focusFigures: s.weakSpotFocus && s.mode === 'flow' ? focusFigures : undefined,
        },
        seed,
      ),
    // prettier-ignore
    [lesson, s.level, s.hands, s.bars, s.keyId, s.timeSignature, s.rhythmComplexity, s.maxPolyphony, s.bpm, s.keyboardSize, s.weakSpotFocus, s.mode, focus, focusFigures, seed],
  );
  const rhythmExercise: RhythmExercise | null = useMemo(
    () =>
      lesson !== 'rhythm'
        ? null
        : generateRhythmExercise({ ...rhythmSettingsFrom(s), focusFigures: s.weakSpotFocus ? focusFigures : undefined }, seed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      lesson,
      s.rhythmLevel,
      s.rhythmTask,
      s.rhythmHands,
      s.rhythmTexture,
      s.rhythmBars,
      s.rhythmTimeSignature,
      s.rhythmBpm,
      s.rhythmRhKey,
      s.rhythmLhKey,
      s.weakSpotFocus,
      focusFigures,
      seed,
    ],
  );
  const earExercise: EarExercise | null = useMemo(
    () =>
      lesson !== 'ear'
        ? null
        : generateEarExercise({ ...earSettingsFrom(s), focusIntervals: s.weakSpotFocus ? focusIntervals : undefined }, seed),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lesson, s.earLevel, s.earLength, s.earReference, s.earKeyId, s.weakSpotFocus, focusIntervals, seed],
  );
  const scaleItem: ScaleItem | null = useMemo(() => {
    if (lesson !== 'scales') return null;
    const picked = s.scaleSource === 'review' && reviewPick ? parseItemId(reviewPick) : null;
    if (picked) return picked;
    const def = SCALE_TYPES[s.scaleType];
    const tonic = s.scaleTonic === 'shuffle' ? (shuffleTonic && def.tonics.includes(shuffleTonic) ? shuffleTonic : def.tonics[0]) : s.scaleTonic;
    return { type: s.scaleType, tonic, hands: s.scaleHands };
  }, [lesson, s.scaleSource, s.scaleType, s.scaleTonic, s.scaleHands, reviewPick, shuffleTonic]);
  const scaleExercise: ScaleExercise | null = useMemo(
    () => {
      if (!scaleItem) return null;
      // The ladder tempo is read when the exercise is made (not on every progress change, so the
      // results of a run stay on screen); retries and tempo changes make a new one.
      const npm = progress.repertoire[itemId(scaleItem)]?.ladderTempo ?? initialNpm(scaleItem, s.scaleNoteValue);
      return generateScaleExercise(scaleItem, { octaves: s.scaleOctaves, noteValue: s.scaleNoteValue, npm });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scaleItem, s.scaleOctaves, s.scaleNoteValue, seed, retryToken, ladderToken],
  );
  const chordItem: ChordItem | null = useMemo(() => {
    if (lesson !== 'chords') return null;
    const picked = s.chordsSource === 'review' && chordReviewPick ? parseChordItemId(chordReviewPick) : null;
    if (picked) return picked;
    if (s.chordsTask === 'drill') return { task: 'drill', set: s.chordsSet, prompt: s.chordsPrompt, inversions: s.chordsInversions };
    const def = findProgression(s.chordsProgression) ?? PROGRESSIONS[0];
    const keys = keysFor(def.mode);
    const key = s.chordsKey === 'shuffle' ? (shuffleChordKey && keys.includes(shuffleChordKey) ? shuffleChordKey : keys[0]) : s.chordsKey;
    return { task: 'progression', progression: def.id, key, hands: s.chordsHands };
  }, [lesson, s.chordsSource, s.chordsTask, s.chordsSet, s.chordsPrompt, s.chordsInversions, s.chordsProgression, s.chordsKey, s.chordsHands, chordReviewPick, shuffleChordKey]);
  const chordExercise: ChordExercise | null = useMemo(
    () => {
      if (!chordItem) return null;
      // Ladder tempo read when the exercise is made, as for scales.
      const bpm = progress.repertoire[chordItemId(chordItem)]?.ladderTempo ?? initialChordBpm(chordItem);
      const focus = s.weakSpotFocus && chordItem.task === 'drill' ? chordFocus : undefined;
      return generateChordExercise(chordItem, { bpm, count: s.chordsCount, focus }, seed);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chordItem, s.chordsCount, s.weakSpotFocus, chordFocus, seed, retryToken, ladderToken],
  );
  const exercise: Exercise = (earExercise ?? rhythmExercise ?? scaleExercise ?? chordExercise ?? sightExercise)!;
  const firstSight = (progress.attempts[exercise.id] ?? 0) === 0;

  const update = useCallback(
    (patch: Partial<Settings>) => {
      if (patch.scaleSource === 'review') setReviewPick(dueScaleItems(progressRef.current, Date.now())[0] ?? null);
      if (patch.chordsSource === 'review') setChordReviewPick(dueChordItems(progressRef.current, Date.now())[0] ?? null);
      if (patch.chordsKey === 'shuffle') {
        const def = findProgression(patch.chordsProgression ?? s.chordsProgression) ?? PROGRESSIONS[0];
        setShuffleChordKey(randomTonic(keysFor(def.mode), null));
      }
      if (patch.scaleTonic === 'shuffle') setShuffleTonic(randomTonic(SCALE_TYPES[patch.scaleType ?? s.scaleType].tonics, null));
      if (patch.scaleType && s.scaleTonic === 'shuffle') setShuffleTonic(randomTonic(SCALE_TYPES[patch.scaleType].tonics, null));
      if (patch.weakSpotFocus) {
        setFocus(weakFocus(progressRef.current));
        setFocusIntervals(weakIntervalFocus(progressRef.current));
        setFocusFigures(weakFigureFocus(progressRef.current));
        setChordFocus(weakChordFocus(progressRef.current));
      }
      updateSettings(patch);
    },
    [updateSettings, s.scaleType, s.scaleTonic, s.chordsProgression],
  );

  const nextExercise = useCallback(() => {
    if (s.weakSpotFocus) {
      setFocus(weakFocus(progressRef.current));
      setFocusIntervals(weakIntervalFocus(progressRef.current));
      setFocusFigures(weakFigureFocus(progressRef.current));
      setChordFocus(weakChordFocus(progressRef.current));
    }
    if (lesson === 'chords') {
      const current = chordItem ? chordItemId(chordItem) : null;
      if (s.chordsSource === 'review') {
        const due = dueChordItems(progressRef.current, Date.now());
        setChordReviewPick(due.find((id) => id !== current) ?? due[0] ?? null);
      } else if (chordItem?.task === 'progression' && s.chordsKey === 'shuffle') {
        const def = findProgression(chordItem.progression) ?? PROGRESSIONS[0];
        setShuffleChordKey(randomTonic(keysFor(def.mode), chordItem.key));
      }
    }
    if (lesson === 'scales') {
      const current = scaleItem ? itemId(scaleItem) : null;
      if (s.scaleSource === 'review') {
        const due = dueScaleItems(progressRef.current, Date.now());
        setReviewPick(due.find((id) => id !== current) ?? due[0] ?? null);
      } else if (s.scaleTonic === 'shuffle') {
        setShuffleTonic(randomTonic(SCALE_TYPES[s.scaleType].tonics, scaleItem?.tonic ?? null));
      }
    }
    setSeed(randomSeed());
  }, [s.weakSpotFocus, lesson, scaleItem, s.scaleSource, s.scaleTonic, s.scaleType, chordItem, s.chordsSource, s.chordsKey]);

  /** Repertoire lessons: move the current item's tempo ladder by hand (± bpm in the note value played). */
  const changeTempo = useCallback(
    (deltaBpm: number) => {
      const ladder = scaleExercise
        ? scaleExercise.scale
        : chordExercise
          ? { itemId: chordExercise.chords.itemId, notesPerBeat: 1, npm: chordExercise.chords.bpm }
          : null;
      if (!ladder) return;
      const { itemId: id, notesPerBeat, npm } = ladder;
      const cur = progressRef.current.repertoire[id];
      const next = {
        ...progressRef.current,
        repertoire: { ...progressRef.current.repertoire, [id]: setLadder(cur, (cur?.ladderTempo ?? npm) + deltaBpm * notesPerBeat, Date.now()) },
      };
      progressRef.current = next;
      setProgress(next);
      setLadderToken((t) => t + 1);
    },
    [scaleExercise, chordExercise, setProgress],
  );

  // ---- Practice session -------------------------------------------------------------
  const onFinished = useCallback(
    (result: ExerciseResult) => {
      const { progress: next, award: earned } = applyResult(progressRef.current, result, new Date());
      progressRef.current = next;
      setProgress(next);
      setAward({ exerciseId: result.exerciseId, award: earned });
    },
    [setProgress],
  );

  const controller: Session = useMemo(
    () =>
      earExercise
        ? new EarController(
            { exercise: earExercise, graceMs: s.chordGraceMs, sustainCountsAsHeld: s.sustainScoring === 'hold', volume: s.synthVolume },
            inputBus,
            audioEngine,
          )
        : chordExercise
          ? new ChordController(
              {
                exercise: chordExercise,
                mode: s.chordsMode,
                goalBpm: s.chordsGoalBpm,
                latencyMs: s.latencyMs,
                playheadDelayMs: s.playheadDelayMs,
                metronomeVolume: s.metronomeVolume,
                countInBars: s.countInBars,
              },
              inputBus,
              audioEngine,
            )
          : rhythmExercise
          ? new RhythmController(
              {
                exercise: rhythmExercise,
                latencyMs: s.latencyMs,
                playheadDelayMs: s.playheadDelayMs,
                metronomeVolume: s.metronomeVolume,
                countInBars: s.countInBars,
                synthVolume: s.synthVolume,
              },
              inputBus,
              audioEngine,
            )
          : new PracticeController(
        {
          exercise,
          mode: lesson === 'scales' ? s.scaleMode : s.mode,
          decorate: scaleExercise ? (raw) => scaleResult(scaleExercise, raw, s.scaleGoalNps * 60) : undefined,
          graceMs: s.chordGraceMs,
          sustainCountsAsHeld: s.sustainScoring === 'hold',
          latencyMs: s.latencyMs,
          playheadDelayMs: s.playheadDelayMs,
          metronomeVolume: s.metronomeVolume,
          countInBars: s.countInBars,
        },
        inputBus,
        audioEngine,
      ),
    // Volume is applied live below; a retry creates a fresh session on the same passage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [exercise, s.mode, s.scaleMode, s.scaleGoalNps, s.chordsMode, s.chordsGoalBpm, s.chordGraceMs, s.sustainScoring, s.latencyMs, s.playheadDelayMs, s.countInBars, retryToken, s.synthVolume],
  );
  useEffect(() => controller.attach(), [controller]);
  useEffect(() => inputBus.subscribe((ev) => keySound.handle(ev)), []);
  useEffect(() => {
    keySound.setEnabled(s.keySound);
    keySound.volume = s.synthVolume;
  }, [s.keySound, s.synthVolume]);
  // Ear training: once audio has been unlocked by a first gesture, new phrases play by themselves.
  useEffect(() => {
    if (controller instanceof EarController && audioEngine.isRunning) {
      const t = setTimeout(() => controller.start(), 350);
      return () => clearTimeout(t);
    }
  }, [controller]);
  useEffect(() => {
    // Development hook for end-to-end tests (stripped from production builds).
    if (import.meta.env.DEV) (window as unknown as { __ppDebug?: unknown }).__ppDebug = { controller, exercise };
  }, [controller, exercise]);
  useEffect(() => controller.finished.on(onFinished), [controller, onFinished]);
  useEffect(() => controller.setMetronomeVolume(s.metronomeVolume), [controller, s.metronomeVolume]);

  const startStop = useCallback(() => {
    const mode = controller.state.get().mode;
    if (mode === 'ear') return controller.start(); // listen / replay
    if (mode !== 'flow') return;
    if (controller.isActive) controller.stop();
    else controller.start();
  }, [controller]);
  const hint = useCallback(() => {
    if (controller instanceof EarController) controller.hint();
  }, [controller]);
  const retry = useCallback(() => setRetryToken((t) => t + 1), []);
  const resultsHidden = hiddenResultsFor === controller;
  const hideResults = useCallback(() => setHiddenResultsFor(controller), [controller]);

  // ---- Piano shortcuts ----------------------------------------------------------
  const gate = useMemo(() => new PianoShortcutGate(), []);
  useEffect(() => {
    gate.reset();
    return controller.finished.on(() => gate.finish(performance.now()));
  }, [controller, gate]);

  const runPianoAction = useCallback(
    (action: PianoAction) => {
      switch (action) {
        case 'retry':
          return retry();
        case 'next':
          return nextExercise();
        case 'close':
          return hideResults();
        case 'easier':
        case 'harder': {
          if (LESSONS[lesson].repertoire) return changeTempo(action === 'harder' ? 4 : -4);
          const key = lesson === 'ear' ? 'earLevel' : lesson === 'rhythm' ? 'rhythmLevel' : 'level';
          const current = s[key];
          const level = Math.min(100, Math.max(1, current + (action === 'harder' ? 1 : -1)));
          if (level !== current) update({ [key]: level });
          return nextExercise();
        }
      }
    },
    [retry, nextExercise, hideResults, s, lesson, update, changeTempo],
  );

  useEffect(
    () =>
      inputBus.subscribe((ev) => {
        const tapped = gate.pedalTap(ev);
        const action = gate.handle(ev);
        if (!s.pianoShortcuts) return;
        const st = controller.state.get();
        if (tapped && st.mode === 'flow' && st.status === 'ready') {
          controller.start();
          return;
        }
        if (tapped && st.mode === 'ear' && st.status !== 'finished') {
          controller.start(); // listen / replay without leaving the keys
          return;
        }
        if (!action || st.status !== 'finished') return;
        if (action === 'close' && resultsHidden) return;
        runPianoAction(action);
      }),
    [controller, gate, s.pianoShortcuts, runPianoAction, resultsHidden],
  );

  const openCalibration = useCallback(() => {
    if (controller.isActive) controller.stop();
    setDrawerOpen(false);
    setCalibrating(true);
  }, [controller]);

  // ---- MIDI -------------------------------------------------------------------------
  const [initialMidiId] = useState(s.midiInputId);
  useEffect(() => {
    void midiService.init(initialMidiId);
    return () => midiService.dispose();
  }, [initialMidiId]);
  const midiState = useStore(midiService.state);

  // ---- Computer keyboard ---------------------------------------------------------
  const [qwertyShift, setQwertyShift] = useState<{ exerciseId: string; base: number } | null>(null);
  const qwertyBase = qwertyShift?.exerciseId === exercise.id ? qwertyShift.base : qwertyBaseFor(exercise.range.min, exercise.range.max);
  // Rhythm mode: J taps the right-hand key, F the left (either one when only one hand plays).
  const rhythmQwerty = useMemo(() => {
    if (!rhythmExercise) return null;
    const { rhKey, lhKey } = rhythmExercise.rhythm;
    const usesLh = rhythmExercise.measures.some((m) => m.lh.length);
    const usesRh = rhythmExercise.measures.some((m) => m.rh.length);
    const map = new Map<string, number>();
    map.set('KeyJ', usesRh ? rhKey : lhKey);
    map.set('KeyF', usesLh ? lhKey : rhKey);
    return map;
  }, [rhythmExercise]);
  const keyToMidi = useCallback(
    (code: string) => (rhythmQwerty ? (rhythmQwerty.get(code) ?? null) : qwertyToMidi(code, qwertyBase)),
    [rhythmQwerty, qwertyBase],
  );

  useEffect(() => {
    const down = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (calibrating) return; // the dialog captures input and handles Escape itself
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const finished = controller.state.get().status === 'finished';
      if (e.key === 'Escape' && finished) {
        hideResults();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (!e.repeat) startStop();
        return;
      }
      if (e.repeat) return;
      if (e.code === 'Enter' && finished && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        nextExercise();
        return;
      }
      if (e.code === 'KeyN') return nextExercise();
      if (e.code === 'KeyR') return finished || controller.state.get().mode !== 'wait' ? retry() : controller.start();
      if (e.code === 'Slash') {
        e.preventDefault();
        return hint();
      }
      if (e.key === 'Shift') {
        inputBus.publish({ kind: 'sustain', down: true, time: performance.now(), source: 'qwerty' });
        return;
      }
      if ((e.code === OCTAVE_DOWN_CODE || e.code === OCTAVE_UP_CODE) && !rhythmQwerty) {
        const delta = e.code === OCTAVE_DOWN_CODE ? -12 : 12;
        setQwertyShift({ exerciseId: exercise.id, base: clampQwertyBase(qwertyBase + delta) });
        return;
      }
      const midi = keyToMidi(e.code);
      if (midi === null || down.has(e.code)) return;
      down.add(e.code);
      inputBus.publish({ kind: 'noteOn', midi, velocity: 80, time: performance.now(), source: 'qwerty' });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (calibrating && !down.has(e.code) && e.key !== 'Shift') return;
      if (e.code === 'Space') e.preventDefault();
      if (e.key === 'Shift') {
        inputBus.publish({ kind: 'sustain', down: false, time: performance.now(), source: 'qwerty' });
        return;
      }
      if (!down.has(e.code)) return;
      down.delete(e.code);
      const midi = keyToMidi(e.code);
      if (midi !== null) inputBus.publish({ kind: 'noteOff', midi, time: performance.now(), source: 'qwerty' });
    };
    const onBlur = () => {
      down.clear();
      inputBus.releaseAll('qwerty', performance.now());
      inputBus.releaseAll('screen', performance.now());
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      onBlur();
    };
  }, [controller, startStop, nextExercise, retry, hint, qwertyBase, keyToMidi, rhythmQwerty, exercise.id, calibrating, hideResults]);

  // ---- Theme ------------------------------------------------------------------------
  useEffect(() => {
    document.documentElement.dataset.theme = s.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.theme === 'dark' ? '#1b1815' : '#f5efe3');
  }, [s.theme]);

  // Ear training must not give the phrase away, so its keyboard window is fixed (C3–C6).
  const kbRange =
    s.keyboardView === 'full'
      ? KEYBOARD_RANGES[s.keyboardSize]
      : lesson === 'ear'
        ? fitKeyboardRange(48, 84, s.keyboardSize)
        : lesson === 'rhythm'
          ? fitKeyboardRange(Math.min(s.rhythmLhKey, s.rhythmRhKey), Math.max(s.rhythmLhKey, s.rhythmRhKey), s.keyboardSize)
          : fitKeyboardRange(exercise.range.min, exercise.range.max, s.keyboardSize);
  const streak = displayStreak(progress.streak, dayKey(new Date()));
  const nowMs = new Date().getTime();
  const weakLabel = focus.length ? focus.slice(0, 4).map((f) => midiLabel(f.midi)).join(', ') : findWeakSpots(progress).notes.length ? 'your weakest notes' : null;
  const connectedInputs = midiState.inputs.filter((i) => i.connected);
  const midiLabelText =
    midiState.status === 'ready' && connectedInputs.length
      ? midiState.selectedId === 'auto'
        ? connectedInputs.length === 1
          ? connectedInputs[0].name
          : `${connectedInputs.length} MIDI inputs`
        : (midiState.inputs.find((i) => i.id === midiState.selectedId)?.name ?? 'Device offline')
      : 'No MIDI device';

  const hasModes = lesson === 'sight' || lesson === 'scales' || lesson === 'chords';
  // Chord drills by symbol (the notation would give the answer) and progressions from the chart.
  const chordChart =
    chordExercise && (chordExercise.chords.item.task === 'drill' ? chordExercise.chords.item.prompt === 'symbol' : !s.chordsNotation);

  const panels = (
    <>
      <div className="sidebar-tabs" role="tablist">
        {(
          [
            ['exercise', 'Exercise'],
            ['input', 'Input & audio'],
            ['progress', 'Progress'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="sidebar-scroll">
        {tab === 'exercise' && lesson === 'sight' ? (
          <ExercisePanel settings={s} progress={progress} update={update} onNew={nextExercise} weakNotesLabel={weakLabel} />
        ) : null}
        {tab === 'exercise' && lesson === 'ear' ? (
          <EarPanel
            settings={s}
            progress={progress}
            update={update}
            onNew={nextExercise}
            weakIntervals={focusIntervals.length ? focusIntervals : weakIntervalFocus(progress)}
          />
        ) : null}
        {tab === 'exercise' && lesson === 'rhythm' ? (
          <RhythmPanel
            settings={s}
            progress={progress}
            update={update}
            onNew={nextExercise}
            weakFigures={findWeakFigures(progress)}
          />
        ) : null}
        {tab === 'exercise' && scaleExercise ? (
          <ScalesPanel
            settings={s}
            progress={progress}
            update={update}
            onNew={nextExercise}
            exercise={scaleExercise}
            onTempo={changeTempo}
            dueCount={dueScaleItems(progress, nowMs).length}
            now={nowMs}
          />
        ) : null}
        {tab === 'exercise' && chordExercise ? (
          <ChordsPanel
            settings={s}
            progress={progress}
            update={update}
            onNew={nextExercise}
            exercise={chordExercise}
            onTempo={changeTempo}
            dueCount={dueChordItems(progress, nowMs).length}
            now={nowMs}
            weak={findWeakChords(progress)}
          />
        ) : null}
        {tab === 'input' ? <InputAudioPanel settings={s} update={update} midi={midiService} qwertyBase={qwertyBase} onCalibrate={openCalibration} /> : null}
        {tab === 'progress' ? (
          <ProgressPanel
            lesson={lesson}
            progress={progress}
            settings={s}
            storageKind={profile.storageKind}
            now={nowMs}
            onReviewChords={() => {
              update({ chordsSource: 'review' });
              setSeed(randomSeed());
              setTab('exercise');
            }}
            onReviewScales={() => {
              update({ scaleSource: 'review' });
              setSeed(randomSeed());
              setTab('exercise');
            }}
            onPracticeWeakSpots={() => {
              setFocus(weakFocus(progressRef.current));
              setFocusIntervals(weakIntervalFocus(progressRef.current));
              setFocusFigures(weakFigureFocus(progressRef.current));
              setChordFocus(weakChordFocus(progressRef.current));
              updateSettings(lesson === 'chords' ? { weakSpotFocus: true, chordsTask: 'drill', chordsSource: 'pick' } : { weakSpotFocus: true });
              setSeed(randomSeed());
              setTab('exercise');
            }}
            onDataReplaced={(settings, p) => {
              progressRef.current = p;
              profile.replaceAll(settings, p);
            }}
          />
        ) : null}
      </div>
    </>
  );

  return (
    <div className={`app ${isNativeApp() ? 'is-native' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">
            practice-piano<span className="brand-tld">.com</span>
          </span>
        </div>
        <div className="topbar-lesson">
          <Segmented<LessonId>
            label="Lesson"
            value={lesson}
            onChange={(next) => {
              controller.stop();
              update({ lesson: next });
              setSeed(randomSeed());
            }}
            options={(Object.keys(LESSONS) as LessonId[]).map((id) => ({
              value: id,
              label: (
                <>
                  <span className="label-long">{LESSONS[id].name}</span>
                  <span className="label-short">{LESSONS[id].short}</span>
                </>
              ),
            }))}
          />
        </div>
        <div className={`topbar-mode ${hasModes ? '' : 'is-hidden'}`} aria-hidden={!hasModes}>
          <Segmented<'wait' | 'flow'>
            label="Practice mode"
            value={lesson === 'scales' ? s.scaleMode : lesson === 'chords' ? s.chordsMode : s.mode === 'flow' ? 'flow' : 'wait'}
            onChange={(mode) => update(lesson === 'scales' ? { scaleMode: mode } : lesson === 'chords' ? { chordsMode: mode } : { mode })}
            options={[
              { value: 'wait', label: 'Wait', title: 'Self-paced: the cursor waits for the right notes' },
              { value: 'flow', label: 'Flow', title: 'Play in time with the metronome' },
            ]}
          />
        </div>
        <div className="topbar-right">
          <span className="chip chip-streak" title="Daily practice streak">
            <span className="chip-icon">◆</span>
            {streak} day{streak === 1 ? '' : 's'}
          </span>
          <span className="chip chip-xp" title="Experience points">
            {progress.xp.toLocaleString()} XP
          </span>
          <button
            type="button"
            className={`chip chip-midi ${connectedInputs.length ? 'is-on' : ''}`}
            onClick={() => {
              setTab('input');
              setDrawerOpen(true);
            }}
            title="MIDI input"
          >
            <span className="dot" aria-hidden="true" />
            <span className="chip-midi-name">{midiLabelText}</span>
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={() => update({ theme: s.theme === 'dark' ? 'light' : 'dark' })}
            aria-label={s.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title="Toggle light / dark"
          >
            {s.theme === 'dark' ? '☀' : '☾'}
          </button>
          <button type="button" className="icon-btn drawer-toggle" onClick={() => setDrawerOpen((o) => !o)} aria-label="Settings">
            ☰
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className={`sidebar ${drawerOpen ? 'is-open' : ''}`}>{panels}</aside>
        {drawerOpen ? <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} /> : null}

        <main className="stage">
          <MetaStrip
            exercise={exercise}
            firstSight={firstSight}
            focus={
              chordExercise
                ? s.weakSpotFocus && chordExercise.chords.item.task === 'drill' && Object.keys({ ...chordFocus.qualities, ...chordFocus.roots }).length > 0
                : s.weakSpotFocus && focus.length > 0
            }
          />
          <div className="score-card">
            {scaleExercise && !s.scaleNotation ? (
              <MemoryCard exercise={scaleExercise} controller={controller} />
            ) : chordExercise && chordChart ? (
              <ChordChart exercise={chordExercise} controller={controller} />
            ) : (
              <ScoreView exercise={exercise} showNoteNames={s.showNoteNames} controller={controller} showFingering={!!scaleExercise && s.showFingering} />
            )}
            <ResultsLayer
              controller={controller}
              award={award?.exerciseId === exercise.id ? award.award : null}
              hidden={resultsHidden}
              pianoShortcuts={s.pianoShortcuts}
              onNext={nextExercise}
              onRetry={retry}
              onClose={hideResults}
            />
          </div>
          <PracticeBar
            controller={controller}
            onHint={hint}
            onRetry={retry}
            onStartStop={startStop}
            onRestart={() => controller.start()}
            onNext={nextExercise}
            resultsHidden={resultsHidden}
            onShowResults={() => setHiddenResultsFor(null)}
            pianoShortcuts={s.pianoShortcuts}
          />
          <KeyboardDock
            controller={controller}
            min={kbRange.min}
            max={kbRange.max}
            settings={s}
            onToggleKeySound={() => update({ keySound: !s.keySound })}
            preferFlats={prefersFlats(exercise.key)}
            qwertyBase={s.showQwertyHints && !rhythmExercise ? qwertyBase : null}
            markers={
              rhythmExercise
                ? new Map<number, string>([
                    ...(rhythmExercise.measures.some((m) => m.lh.length) ? [[rhythmExercise.rhythm.lhKey, 'LH · F'] as const] : []),
                    ...(rhythmExercise.measures.some((m) => m.rh.length) ? [[rhythmExercise.rhythm.rhKey, 'RH · J'] as const] : []),
                  ])
                : undefined
            }
          />
        </main>
      </div>
      {calibrating ? (
        <LatencyCalibration
          volume={s.metronomeVolume}
          midiConnected={connectedInputs.length > 0}
          onClose={() => setCalibrating(false)}
          onApply={(o) => {
            update({
              latencyMs: o.latencyMs,
              playheadDelayMs: o.playheadDelayMs ?? s.playheadDelayMs,
              calibration: o.record,
              audioSetup: 'calibrated',
            });
            setCalibrating(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** Scales "from memory": no notation, just what to play and how far you are. */
function MemoryCard(props: { exercise: ScaleExercise; controller: Session }) {
  const state = useStore(props.controller.state);
  const { scale } = props.exercise;
  const total = props.exercise.steps.length;
  const done = state.status === 'finished' ? total : Math.min(total, state.stepIndex);
  return (
    <div className="memory-card">
      <div className="memory-title">{scale.title}</div>
      <div className="memory-sub">
        {scale.item.hands === 'rh' ? 'Right hand' : scale.item.hands === 'lh' ? 'Left hand' : scale.item.hands === 'together' ? 'Hands together' : 'Contrary motion'} ·{' '}
        {scale.octaves} octave{scale.octaves > 1 ? 's' : ''} · up and down
      </div>
      <div className="progress-track memory-progress">
        <div className="progress-fill" style={{ width: `${(done / Math.max(1, total)) * 100}%` }} />
      </div>
    </div>
  );
}

function ResultsLayer(props: {
  controller: Session;
  award: Award | null;
  hidden: boolean;
  pianoShortcuts: boolean;
  onNext: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const state = useStore(props.controller.state);
  if (state.status !== 'finished' || !state.result || props.hidden) return null;
  return (
    <ResultsCard
      result={state.result}
      award={props.award}
      pianoShortcuts={props.pianoShortcuts}
      onNext={props.onNext}
      onRetry={props.onRetry}
      onClose={props.onClose}
    />
  );
}

const ACTION_LABELS = new Map(PIANO_ACTIONS.map((a) => [a.pc, a.label]));

function KeyboardDock(props: {
  controller: Session;
  min: number;
  max: number;
  settings: Settings;
  preferFlats: boolean;
  qwertyBase: number | null;
  /** Rhythm mode: the designated keys. */
  markers?: Map<number, string>;
  onToggleKeySound: () => void;
}) {
  const held = useStore(inputBus.held);
  const soundOn = props.settings.keySound;
  const state = useStore(props.controller.state);
  const expected = props.settings.showKeyboardGuide && state.status !== 'finished' ? state.expected : [];
  const actions = props.settings.pianoShortcuts && state.status === 'finished' ? ACTION_LABELS : undefined;
  return (
    <div className="keyboard-dock">
      <div className="keyboard-head">
        <InputMonitor preferFlats={props.preferFlats} />
        <div className="kb-right">
          <span className="muted kb-range">
            {midiLabel(props.min)}–{midiLabel(props.max)}
          </span>
          <button
            type="button"
            className={`kb-sound ${soundOn ? 'is-on' : ''}`}
            aria-pressed={soundOn}
            aria-label="Key sound for on-screen and computer keys"
            title={soundOn ? 'Key sound on — on-screen and computer keys play a piano sound' : 'Key sound off — turn on to hear on-screen and computer keys'}
            onClick={props.onToggleKeySound}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" fill="currentColor" />
              {soundOn ? (
                <path d="M13 7a4 4 0 0 1 0 6M15.5 4.8a7 7 0 0 1 0 10.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              ) : (
                <path d="M13.2 7.6l4.4 4.8M17.6 7.6l-4.4 4.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>
      <PianoKeyboard
        min={props.min}
        max={props.max}
        held={held.held}
        sustained={held.sustained}
        expected={expected}
        wrong={state.wrong?.midi ?? null}
        showLabels={props.settings.showNoteNames}
        preferFlats={props.preferFlats}
        qwertyBase={props.qwertyBase}
        actions={actions}
        markers={state.status === 'finished' ? undefined : props.markers}
      />
    </div>
  );
}
