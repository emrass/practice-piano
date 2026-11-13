import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ExerciseResult } from '../core/eval/types';
import type { LessonId } from '../core/lessons';
import { LESSONS } from '../core/lessons';
import { randomSeed } from '../core/generator/rng';
import { PIANO_ACTIONS, type PianoAction, PianoShortcutGate } from '../core/input/pianoShortcuts';
import { clampQwertyBase, OCTAVE_DOWN_CODE, OCTAVE_UP_CODE, qwertyBaseFor, qwertyToMidi } from '../core/input/qwerty';
import { fitKeyboardRange, KEYBOARD_RANGES } from '../core/keyboard/range';
import { prefersFlats } from '../core/music/keys';
import { midiLabel, type PcSpelling } from '../core/music/pitch';
import { applyResult, type Award, dayKey, displayStreak } from '../core/progress/progress';
import type { Settings, SettingsPatch } from '../core/settings';
import { useStore } from '../lib/store';
import { inputBus } from '../input/inputBus';
import { KeySound } from '../input/keySound';
import { audioEngine } from '../platform/audio/audioEngine';
import { MidiService } from '../platform/midi/midiService';
import { isNativeApp } from '../platform/native';
import { Segmented } from './components/controls';
import { InputAudioPanel, InputMonitor } from './components/InputAudioPanel';
import { KeyboardControls } from './components/KeyboardControls';
import { LatencyCalibration } from './components/LatencyCalibration';
import { MetaStrip } from './components/MetaStrip';
import { PianoKeyboard } from './components/PianoKeyboard';
import { PracticeBar } from './components/PracticeBar';
import { ProgressPanel } from './components/ProgressPanel';
import { ResultsCard } from './components/ResultsCard';
import { ScoreView } from './components/ScoreView';
import { type LessonRuntime, useLesson } from './lessons';
import type { KeyboardAvailability } from './lessons/types';
import type { PracticeState, Session } from './practice/session';
import { type Profile, useProfile } from './state/useProfile';

const midiService = new MidiService(inputBus);

type Tab = 'exercise' | 'input' | 'progress';

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
  const reseed = useCallback(() => setSeed(randomSeed()), []);
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
  const lesson: LessonId = s.lesson;

  // ---- Lesson -------------------------------------------------------------------------
  // Settings changes go through the active lesson first (review queue, shuffled key, focus).
  const runtimeRef = useRef<LessonRuntime | null>(null);
  const update = useCallback(
    (patch: SettingsPatch) => {
      runtimeRef.current?.onPatch?.(patch);
      updateSettings(patch);
    },
    [updateSettings],
  );
  const nowMs = new Date().getTime();
  const runtime = useLesson(lesson, { settings: s, progress, progressRef, setProgress, update, seed, reseed, retryToken, now: nowMs });
  useLayoutEffect(() => {
    runtimeRef.current = runtime;
  });
  const { exercise } = runtime;
  const firstSight = (progress.attempts[exercise.id] ?? 0) === 0;
  // Stable callbacks (the runtime is rebuilt every render; effects keyed on these must not re-run).
  const nextExercise = useCallback(() => runtimeRef.current?.next(), []);

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

  // The lesson makes a new session per exercise, mode or retry; the metronome volume is applied live below.
  const controller: Session = runtime.session;
  useEffect(() => controller.attach(), [controller]);
  useEffect(() => inputBus.subscribe((ev) => keySound.handle(ev)), []);
  useEffect(() => {
    keySound.setEnabled(s.keySound);
    keySound.volume = s.synthVolume;
  }, [s.keySound, s.synthVolume]);
  // Ear training: once audio has been unlocked by a first gesture, new phrases play by themselves.
  const autoStart = !!runtime.autoStart;
  useEffect(() => {
    if (autoStart && audioEngine.isRunning) {
      const t = setTimeout(() => controller.start(), 350);
      return () => clearTimeout(t);
    }
  }, [controller, autoStart]);
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
  // A hint while the guide already lights the keys would only cost the step.
  const guideOn = s.showKeyboardGuide && !runtime.keyboard.unavailable?.guide;
  const hint = useCallback(() => {
    if (guideOn && controller.state.get().expected.length) return;
    controller.hint?.();
  }, [controller, guideOn]);
  const retry = useCallback(() => setRetryToken((t) => t + 1), []);
  const resultsHidden = hiddenResultsFor === controller;
  const hideResults = useCallback(() => setHiddenResultsFor(controller), [controller]);

  // ---- Piano shortcuts ----------------------------------------------------------
  const gate = useMemo(() => new PianoShortcutGate(), []);
  useEffect(() => {
    gate.reset();
    return controller.finished.on(() => gate.finish(performance.now()));
  }, [controller, gate]);

  const step = useCallback((direction: 1 | -1) => runtimeRef.current?.step(direction), []);
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
        case 'harder':
          return step(action === 'harder' ? 1 : -1);
      }
    },
    [retry, nextExercise, hideResults, step],
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
  // Rhythm maps J / F to its two keys instead of the usual layout.
  const rhythmQwerty = runtime.keyboard.qwerty ?? null;
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

  const span = runtime.keyboard.span;
  const kbRange = s.keyboardView === 'full' ? KEYBOARD_RANGES[s.keyboardSize] : fitKeyboardRange(span.min, span.max, s.keyboardSize);
  const streak = displayStreak(progress.streak, dayKey(new Date()));
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
        {tab === 'exercise' ? runtime.panel : null}
        {tab === 'input' ? <InputAudioPanel settings={s} update={update} midi={midiService} qwertyBase={qwertyBase} onCalibrate={openCalibration} /> : null}
        {tab === 'progress' ? (
          <ProgressPanel
            lesson={lesson}
            progress={progress}
            settings={s}
            storageKind={profile.storageKind}
            now={nowMs}
            onReview={
              runtime.review
                ? () => {
                    runtime.review?.();
                    setTab('exercise');
                  }
                : undefined
            }
            onPracticeWeakSpots={() => {
              runtime.practiceWeakSpots();
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
        <div className={`topbar-mode ${runtime.mode ? '' : 'is-hidden'}`} aria-hidden={!runtime.mode}>
          <Segmented<'wait' | 'flow'>
            label="Practice mode"
            value={runtime.mode?.value ?? 'wait'}
            onChange={(mode) => runtime.mode?.set(mode)}
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
          <MetaStrip exercise={exercise} firstSight={firstSight} focus={runtime.focusActive} />
          <div className="score-card">
            {runtime.stage ? (
              runtime.stage(controller)
            ) : (
              <ScoreView exercise={exercise} showNoteNames={s.showStaffNames} controller={controller} showFingering={!!runtime.score?.showFingering} />
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
            keyboardGuide={guideOn}
          />
          <KeyboardDock
            controller={controller}
            min={kbRange.min}
            max={kbRange.max}
            settings={s}
            update={update}
            availability={runtime.keyboard}
            preferFlats={prefersFlats(exercise.key)}
            qwertyBase={s.showQwertyHints && !runtime.keyboard.unavailable?.qwertyHints ? qwertyBase : null}
            markers={runtime.keyboard.markers}
            spelling={runtime.keyboard.spelling}
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
  markers?: ReadonlyMap<number, string>;
  /** Spelling that follows the run (chords: the chord asked for). */
  spelling?: (state: PracticeState) => PcSpelling | undefined;
  update: (patch: SettingsPatch) => void;
  availability: KeyboardAvailability;
}) {
  const held = useStore(inputBus.held);
  const soundOn = props.settings.keySound;
  const state = useStore(props.controller.state);
  const guideOn = props.settings.showKeyboardGuide && !props.availability.unavailable?.guide;
  const expected = useMemo(
    () => (state.status === 'finished' ? [] : [...new Set([...(guideOn ? state.expected : []), ...state.revealed])]),
    [state.status, state.expected, state.revealed, guideOn],
  );
  const actions = props.settings.pianoShortcuts && state.status === 'finished' ? ACTION_LABELS : undefined;
  const spelling = props.spelling?.(state);
  return (
    <div className="keyboard-dock">
      <div className="keyboard-head">
        <InputMonitor preferFlats={props.preferFlats} spelling={spelling} />
        <div className="kb-right">
          <span className="muted kb-range">
            {midiLabel(props.min)}–{midiLabel(props.max)}
          </span>
          <KeyboardControls settings={props.settings} update={props.update} availability={props.availability} />
          <button
            type="button"
            className={`kb-icon kb-sound ${soundOn ? 'is-on' : ''}`}
            aria-pressed={soundOn}
            aria-label="Key sound for on-screen and computer keys"
            title={soundOn ? 'Key sound on — on-screen and computer keys play a piano sound' : 'Key sound off — turn on to hear on-screen and computer keys'}
            onClick={() => props.update({ keySound: !soundOn })}
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
        showLabels={props.settings.showKeyNames}
        preferFlats={props.preferFlats}
        spelling={spelling}
        qwertyBase={props.qwertyBase}
        actions={actions}
        markers={state.status === 'finished' ? undefined : props.markers}
      />
    </div>
  );
}
