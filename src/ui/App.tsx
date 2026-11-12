import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Exercise } from '../core/exercise';
import type { ExerciseResult } from '../core/eval/types';
import { generateExercise, type FocusNote } from '../core/generator/generator';
import { randomSeed } from '../core/generator/rng';
import { PIANO_ACTIONS, type PianoAction, PianoShortcutGate } from '../core/input/pianoShortcuts';
import { clampQwertyBase, OCTAVE_DOWN_CODE, OCTAVE_UP_CODE, qwertyBaseFor, qwertyToMidi } from '../core/input/qwerty';
import { fitKeyboardRange, KEYBOARD_RANGES } from '../core/keyboard/range';
import { prefersFlats } from '../core/music/keys';
import { midiLabel } from '../core/music/pitch';
import { applyResult, type Award, dayKey, displayStreak, findWeakSpots, type ProgressState } from '../core/progress/progress';
import type { Settings } from '../core/settings';
import { useStore } from '../lib/store';
import { inputBus } from '../input/inputBus';
import { audioEngine } from '../platform/audio/audioEngine';
import { MidiService } from '../platform/midi/midiService';
import { isNativeApp } from '../platform/native';
import { Segmented } from './components/controls';
import { ExercisePanel } from './components/ExercisePanel';
import { InputAudioPanel, InputMonitor } from './components/InputAudioPanel';
import { LatencyCalibration } from './components/LatencyCalibration';
import { MetaStrip } from './components/MetaStrip';
import { PianoKeyboard } from './components/PianoKeyboard';
import { PracticeBar } from './components/PracticeBar';
import { ProgressPanel } from './components/ProgressPanel';
import { ResultsCard } from './components/ResultsCard';
import { ScoreView } from './components/ScoreView';
import { PracticeController } from './practice/PracticeController';
import { type Profile, useProfile } from './state/useProfile';

const midiService = new MidiService(inputBus);

type Tab = 'exercise' | 'input' | 'progress';

function weakFocus(progress: ProgressState): FocusNote[] {
  return findWeakSpots(progress).notes.map((n) => ({ midi: n.midi, clef: n.clef }));
}

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
  const [retryToken, setRetryToken] = useState(0);
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
  const exercise: Exercise = useMemo(
    () =>
      generateExercise(
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
        },
        seed,
      ),
    [s.level, s.hands, s.bars, s.keyId, s.timeSignature, s.rhythmComplexity, s.maxPolyphony, s.bpm, s.keyboardSize, s.weakSpotFocus, focus, seed],
  );
  const firstSight = (progress.attempts[exercise.id] ?? 0) === 0;

  const update = useCallback(
    (patch: Partial<Settings>) => {
      if (patch.weakSpotFocus) setFocus(weakFocus(progressRef.current));
      updateSettings(patch);
    },
    [updateSettings],
  );

  const nextExercise = useCallback(() => {
    if (s.weakSpotFocus) setFocus(weakFocus(progressRef.current));
    setSeed(randomSeed());
  }, [s.weakSpotFocus]);

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

  const controller = useMemo(
    () =>
      new PracticeController(
        {
          exercise,
          mode: s.mode,
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
    [exercise, s.mode, s.chordGraceMs, s.sustainScoring, s.latencyMs, s.playheadDelayMs, s.countInBars, retryToken],
  );
  useEffect(() => controller.attach(), [controller]);
  useEffect(() => {
    // Development hook for end-to-end tests (stripped from production builds).
    if (import.meta.env.DEV) (window as unknown as { __ppDebug?: unknown }).__ppDebug = { controller, exercise };
  }, [controller, exercise]);
  useEffect(() => controller.finished.on(onFinished), [controller, onFinished]);
  useEffect(() => controller.setMetronomeVolume(s.metronomeVolume), [controller, s.metronomeVolume]);

  const startStop = useCallback(() => {
    if (controller.state.get().mode !== 'flow') return;
    if (controller.isActive) controller.stop();
    else controller.start();
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
          const level = Math.min(100, Math.max(1, s.level + (action === 'harder' ? 1 : -1)));
          if (level !== s.level) update({ level });
          return nextExercise();
        }
      }
    },
    [retry, nextExercise, hideResults, s.level, update],
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
      if (e.code === 'KeyR') return finished || controller.state.get().mode === 'flow' ? retry() : controller.start();
      if (e.key === 'Shift') {
        inputBus.publish({ kind: 'sustain', down: true, time: performance.now(), source: 'qwerty' });
        return;
      }
      if (e.code === OCTAVE_DOWN_CODE || e.code === OCTAVE_UP_CODE) {
        const delta = e.code === OCTAVE_DOWN_CODE ? -12 : 12;
        setQwertyShift({ exerciseId: exercise.id, base: clampQwertyBase(qwertyBase + delta) });
        return;
      }
      const midi = qwertyToMidi(e.code, qwertyBase);
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
      const midi = qwertyToMidi(e.code, qwertyBase);
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
  }, [controller, startStop, nextExercise, retry, qwertyBase, exercise.id, calibrating, hideResults]);

  // ---- Theme ------------------------------------------------------------------------
  useEffect(() => {
    document.documentElement.dataset.theme = s.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.theme === 'dark' ? '#1b1815' : '#f5efe3');
  }, [s.theme]);

  const kbRange = s.keyboardView === 'full' ? KEYBOARD_RANGES[s.keyboardSize] : fitKeyboardRange(exercise.range.min, exercise.range.max, s.keyboardSize);
  const streak = displayStreak(progress.streak, dayKey(new Date()));
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
        {tab === 'exercise' ? <ExercisePanel settings={s} progress={progress} update={update} onNew={nextExercise} weakNotesLabel={weakLabel} /> : null}
        {tab === 'input' ? <InputAudioPanel settings={s} update={update} midi={midiService} qwertyBase={qwertyBase} onCalibrate={openCalibration} /> : null}
        {tab === 'progress' ? (
          <ProgressPanel
            progress={progress}
            settings={s}
            storageKind={profile.storageKind}
            onPracticeWeakSpots={() => {
              setFocus(weakFocus(progressRef.current));
              updateSettings({ weakSpotFocus: true });
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
        <Segmented
          label="Practice mode"
          value={s.mode}
          onChange={(mode) => update({ mode })}
          options={[
            { value: 'wait', label: 'Wait mode', title: 'Self-paced: the cursor waits for the right notes' },
            { value: 'flow', label: 'Flow mode', title: 'Play in time with the metronome' },
          ]}
        />
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
          <MetaStrip exercise={exercise} firstSight={firstSight} focus={s.weakSpotFocus && focus.length > 0} />
          <div className="score-card">
            <ScoreView exercise={exercise} showNoteNames={s.showNoteNames} controller={controller} />
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
            preferFlats={prefersFlats(exercise.key)}
            qwertyBase={s.showQwertyHints ? qwertyBase : null}
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

function ResultsLayer(props: {
  controller: PracticeController;
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
  controller: PracticeController;
  min: number;
  max: number;
  settings: Settings;
  preferFlats: boolean;
  qwertyBase: number | null;
}) {
  const held = useStore(inputBus.held);
  const state = useStore(props.controller.state);
  const expected = props.settings.showKeyboardGuide && state.status !== 'finished' ? state.expected : [];
  const actions = props.settings.pianoShortcuts && state.status === 'finished' ? ACTION_LABELS : undefined;
  return (
    <div className="keyboard-dock">
      <div className="keyboard-head">
        <InputMonitor />
        <span className="muted kb-range">
          {midiLabel(props.min)}–{midiLabel(props.max)}
        </span>
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
      />
    </div>
  );
}
