import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { ExerciseResult } from '../core/eval/types';
import type { LessonId } from '../core/lessons';
import { randomSeed } from '../core/generator/rng';
import { fitKeyboardRange, KEYBOARD_RANGES } from '../core/keyboard/range';
import { prefersFlats } from '../core/music/keys';
import { applyResult, type Award } from '../core/progress/progress';
import type { SettingsPatch } from '../core/settings';
import { useStore } from '../lib/store';
import { inputBus } from '../input/inputBus';
import { KeySound } from '../input/keySound';
import { audioEngine } from '../platform/audio/audioEngine';
import { MidiService } from '../platform/midi/midiService';
import { isNativeApp } from '../platform/native';
import { setReloadGuard } from '../platform/serviceWorker';
import { requestPersistentStorageOnce } from '../platform/storageProtection';
import { KeyboardDock } from './components/KeyboardDock';
import { LatencyCalibration } from './components/LatencyCalibration';
import { MetaStrip } from './components/MetaStrip';
import { PianoAudioDialog } from './components/PianoAudioDialog';
import { PracticeBar } from './components/PracticeBar';
import { ProgressPanel } from './components/ProgressPanel';
import { ResultsCard } from './components/ResultsCard';
import { Tabs } from './components/controls';
import { LogoKeys } from './components/Icon';
import { ScoreView } from './components/ScoreView';
import { AudioSetupGuide, FirstRunGuide } from './components/SetupGuides';
import { TopBar } from './components/TopBar';
import { useComputerKeyboard } from './hooks/useComputerKeyboard';
import { type AutoStartFrom, useEarAutoStart } from './hooks/useEarAutoStart';
import { usePianoShortcuts } from './hooks/usePianoShortcuts';
import { type LessonRuntime, useLesson } from './lessons';
import type { Continuation } from './lessons/types';
import { PlanPage } from './plan/PlanPage';
import { PlanPanel } from './plan/PlanPanel';
import { PlanSteps } from './plan/PlanSteps';
import { usePlan } from './plan/usePlan';
import { isIdle, type Session } from './practice/session';
import { type Profile, useProfile } from './state/useProfile';

const midiService = new MidiService(inputBus);

type Tab = 'exercise' | 'progress';

/** Optional sound for the on-screen and computer keys (MIDI pianos make their own). */
const keySound = new KeySound(audioEngine);

export function App() {
  const profile = useProfile();
  if (!profile.ready) {
    return (
      <div className="splash">
        <LogoKeys />
        Loading your studio…
      </div>
    );
  }
  return <Studio profile={profile} />;
}

function Studio({ profile }: { profile: Profile }) {
  const { progress, updateSettings, setProgress } = profile;
  const [seed, setSeed] = useState(randomSeed);
  const reseed = useCallback(() => setSeed(randomSeed()), []);
  const [retryToken, setRetryToken] = useState(0);
  const [tab, setTab] = useState<Tab>('exercise');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [award, setAward] = useState<{ exerciseId: string; award: Award } | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  /** The piano & audio guide, opened from Piano & audio. The first-run guide opens by itself until it was seen once. */
  const [audioGuideOpen, setAudioGuideOpen] = useState(false);
  const setupOpen = !profile.settings.setupGuideSeen || audioGuideOpen;
  /** Piano & audio: the settings every lesson shares, opened from the piano chip. */
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hiddenResultsFor, setHiddenResultsFor] = useState<object | null>(null);
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  // ---- Today's practice ------------------------------------------------------------
  // The plan meets the lessons in four places, all in this file: the settings they are given
  // (a block's are laid over the player's own), settings changes on their way back, each
  // finished run, and the way on from an exercise. Everything else about it is in ui/plan.
  const plan = usePlan({ settings: profile.settings, progressRef, updateSettings });
  const s = plan.settings;
  /** Today's plan page is showing: no lesson is on the stage. */
  const onPlanPage = plan.open && !plan.playing;
  const lesson: LessonId = s.lesson;

  // ---- Lesson -------------------------------------------------------------------------
  // Settings changes go through the active lesson first (review queue, shuffled key, focus).
  const runtimeRef = useRef<LessonRuntime | null>(null);
  const planUpdate = plan.update;
  const update = useCallback(
    (patch: SettingsPatch) => {
      runtimeRef.current?.onPatch?.(patch);
      planUpdate(patch);
    },
    [planUpdate],
  );
  // Ear training plays a phrase by itself only after the player asked for a new one (or a retry):
  // remembers the session that was on screen then, so the next session plays once it arrives.
  const autoStartFrom = useRef<AutoStartFrom>(null);
  const armAutoStart = useCallback(() => {
    autoStartFrom.current = { session: runtimeRef.current?.session ?? null };
  }, []);
  const nowMs = new Date().getTime();
  const runtime = useLesson(lesson, { settings: s, progress, progressRef, setProgress, update, seed, reseed, retryToken, armAutoStart, now: nowMs });
  // The way on from this exercise: the lesson's own, or the plan's once a block has its runs.
  const continuation = plan.continuation(runtime.continuation);
  const continuationRef = useRef(continuation);
  useLayoutEffect(() => {
    runtimeRef.current = runtime;
    continuationRef.current = continuation;
  });
  const { exercise } = runtime;
  const firstSight = (progress.attempts[exercise.id] ?? 0) === 0;
  // Stable callbacks (the runtime is rebuilt every render; effects keyed on these must not re-run).
  // N, piano D and the next buttons all come through here: without a `next` there is nothing to move on to.
  // A block has just come onto the stage: set its lesson up the way the Progress tab does (the
  // due items, the weak spots), with a new exercise. `move` changes the plan; it is rendered at
  // once so the block's lesson is the active one when it is set up.
  const { blockNow, canMoveOn, next: planNext, start: planStart, skip: planSkip } = plan;
  const moveToBlock = useCallback(
    (move: () => void) => {
      flushSync(move);
      const block = blockNow();
      const active = runtimeRef.current;
      if (!block || !active) return;
      armAutoStart();
      if (block.start === 'review' && active.review) active.review();
      else if (block.start === 'weak-spots') active.practiceWeakSpots();
      else reseed();
    },
    [blockNow, armAutoStart, reseed],
  );
  const startPlanBlock = useCallback(() => moveToBlock(planStart), [moveToBlock, planStart]);
  const skipPlanBlock = useCallback(() => moveToBlock(planSkip), [moveToBlock, planSkip]);
  const nextExercise = useCallback(() => {
    if (canMoveOn()) moveToBlock(planNext);
    else if (runtimeRef.current?.continuation.next) runtimeRef.current.next();
  }, [canMoveOn, moveToBlock, planNext]);

  // ---- Practice session -------------------------------------------------------------
  const planRecord = plan.record;
  const onFinished = useCallback(
    (result: ExerciseResult) => {
      const { progress: next, award: earned } = applyResult(progressRef.current, result, new Date());
      progressRef.current = next;
      setProgress(next);
      planRecord(result, earned);
      setAward({ exerciseId: result.exerciseId, award: earned });
      // Restart replays on the same session: results closed after an earlier run must not hide this one's.
      setHiddenResultsFor(null);
      // A pause in practice: the one moment the app asks the browser to keep its data.
      requestPersistentStorageOnce();
    },
    [setProgress, planRecord],
  );

  // The lesson makes a new session per exercise, mode or retry; the metronome volume is applied live below.
  const controller: Session = runtime.session;
  // On the plan page the lesson underneath does not listen: the piano starts the next block there.
  useEffect(() => (onPlanPage ? undefined : controller.attach()), [controller, onPlanPage]);
  useEffect(() => inputBus.subscribe((ev) => keySound.handle(ev)), []);
  useEffect(() => {
    keySound.setEnabled(s.keySound);
    keySound.volume = s.synthVolume;
  }, [s.keySound, s.synthVolume]);
  useEarAutoStart(autoStartFrom, controller, !!runtime.autoStart);
  useEffect(() => {
    // Development hook for end-to-end tests (stripped from production builds).
    if (import.meta.env.DEV) (window as unknown as { __ppDebug?: unknown }).__ppDebug = { controller, exercise };
  }, [controller, exercise]);
  useEffect(() => controller.finished.on(onFinished), [controller, onFinished]);
  useEffect(() => controller.setMetronomeVolume(s.metronomeVolume), [controller, s.metronomeVolume]);

  // ---- App updates ------------------------------------------------------------------
  // A new version of the web app reloads the page only when that loses nothing: no run under way
  // and no dialog open (platform/serviceWorker.ts).
  const dialogOpenRef = useRef(false);
  useLayoutEffect(() => {
    dialogOpenRef.current = setupOpen || settingsOpen || calibrating;
  });
  useEffect(
    () =>
      setReloadGuard(() => {
        const session = runtimeRef.current?.session;
        return !dialogOpenRef.current && (!session || isIdle(session.state.get()));
      }),
    [],
  );

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
  const retry = useCallback(() => {
    armAutoStart();
    setRetryToken((t) => t + 1);
  }, [armAutoStart]);
  /** Enter after a run: what the lesson suggests. */
  const continueRun = useCallback(() => {
    if (continuationRef.current.primary === 'repeat') retry();
    else nextExercise();
  }, [retry, nextExercise]);
  const resultsHidden = hiddenResultsFor === controller;
  const hideResults = useCallback(() => setHiddenResultsFor(controller), [controller]);

  // ---- Piano shortcuts ----------------------------------------------------------
  const step = useCallback((direction: 1 | -1) => runtimeRef.current?.step(direction), []);
  usePianoShortcuts({ controller, enabled: s.pianoShortcuts && !onPlanPage, resultsHidden, retry, nextExercise, hideResults, step });

  const openCalibration = useCallback(() => {
    if (controller.isActive) controller.stop();
    setDrawerOpen(false);
    setCalibrating(true);
  }, [controller]);
  const openSettings = useCallback(() => {
    if (controller.isActive) controller.stop();
    setDrawerOpen(false);
    setSettingsOpen(true);
  }, [controller]);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openAudioGuide = useCallback(() => {
    if (controller.isActive) controller.stop();
    setSettingsOpen(false);
    setDrawerOpen(false);
    setAudioGuideOpen(true);
  }, [controller]);
  const closeSetup = useCallback(() => {
    updateSettings({ setupGuideSeen: true });
    setAudioGuideOpen(false);
  }, [updateSettings]);

  // ---- MIDI -------------------------------------------------------------------------
  const [initialMidiId] = useState(s.midiInputId);
  useEffect(() => {
    void midiService.init(initialMidiId);
    return () => midiService.dispose();
  }, [initialMidiId]);
  const midiState = useStore(midiService.state);

  // ---- Computer keyboard ---------------------------------------------------------
  const qwertyBase = useComputerKeyboard({
    controller,
    exercise,
    rhythmQwerty: runtime.keyboard.qwerty,
    // The plan page handles its own keys (Enter on the way on), like a dialog.
    dialogOpen: calibrating || setupOpen || settingsOpen || onPlanPage,
    startStop,
    nextExercise,
    retry,
    continueRun,
    hint,
    hideResults,
  });

  // ---- Theme ------------------------------------------------------------------------
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = s.theme;
    // The browser and status bar take the top bar's surface (see design/vitePlugin.ts).
    const surface = getComputedStyle(root).getPropertyValue('--surface-sheet').trim();
    if (surface) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', surface);
  }, [s.theme]);

  const span = runtime.keyboard.span;
  const kbRange = s.keyboardView === 'full' ? KEYBOARD_RANGES[s.keyboardSize] : fitKeyboardRange(span.min, span.max, s.keyboardSize);

  /** The Progress tab's actions set a lesson up by hand: that is free practice, in the lesson shown. */
  const leaveToday = () => {
    if (plan.open) plan.setOpen(false, { lesson });
  };
  const toPlanPage = () => {
    if (controller.isActive) controller.stop();
    setDrawerOpen(false);
    plan.toPage();
  };

  const panels = (
    <>
      <Tabs<Tab>
        label="Sidebar"
        idBase="sidebar"
        fill
        tabs={[
          { id: 'exercise', label: onPlanPage ? 'Plan' : plan.playing ? 'This block' : 'Exercise' },
          { id: 'progress', label: 'Progress' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="sidebar-scroll" role="tabpanel" id="sidebar-panel" aria-labelledby={`sidebar-tab-${tab}`}>
        {tab === 'exercise' ? onPlanPage ? <PlanPanel prefs={s.plan} day={plan.day} onChange={plan.setPrefs} /> : runtime.panel : null}
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
                    leaveToday();
                    runtime.review?.();
                    setTab('exercise');
                  }
                : undefined
            }
            onPracticeWeakSpots={() => {
              leaveToday();
              runtime.practiceWeakSpots();
              setTab('exercise');
            }}
            onDataReplaced={(settings, p) => {
              progressRef.current = p;
              profile.replaceAll(settings, p);
              plan.replaced(settings, p);
            }}
          />
        ) : null}
      </div>
    </>
  );

  return (
    <div className={['app', isNativeApp() ? 'is-native' : '', plan.playing ? 'is-plan-block' : ''].filter(Boolean).join(' ')}>
      <TopBar
        settings={s}
        update={update}
        onLessonChange={(next) => {
          controller.stop();
          update({ lesson: next });
          setSeed(randomSeed());
        }}
        onWayChange={(way) => {
          if (controller.isActive) controller.stop();
          setDrawerOpen(false);
          setTab('exercise');
          plan.setOpen(way === 'today');
        }}
        steps={
          plan.playing && plan.day ? (
            <>
              <button type="button" className="btn" onClick={toPlanPage} title="Back to today's plan.">
                Plan
              </button>
              <PlanSteps day={plan.day} />
            </>
          ) : undefined
        }
        mode={onPlanPage ? undefined : runtime.mode}
        progress={progress}
        midi={midiState}
        onOpenMidi={openSettings}
        onToggleDrawer={() => setDrawerOpen((o) => !o)}
      />

      <div className="workspace">
        {/* Before the sidebar, so the drawer paints over it on the same layer (--z-drawer). */}
        {drawerOpen ? <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} /> : null}
        <aside className={`sidebar ${drawerOpen ? 'is-open' : ''}`}>{panels}</aside>

        {onPlanPage ? (
          plan.day ? (
            <PlanPage
              day={plan.day}
              progress={progress}
              pianoShortcuts={s.pianoShortcuts}
              inert={calibrating || setupOpen || settingsOpen}
              onStart={startPlanBlock}
              onSkip={skipPlanBlock}
              onRestore={plan.restore}
              onFreePractice={() => plan.setOpen(false)}
            />
          ) : (
            <main className="plan-page" />
          )
        ) : (
          <main className="stage">
            <MetaStrip exercise={exercise} firstSight={firstSight} focus={runtime.focusActive} />
            <div className="score">
              {runtime.stage ? (
                runtime.stage(controller)
              ) : (
                <ScoreView exercise={exercise} showNoteNames={s.showStaffNames} controller={controller} showFingering={!!runtime.score?.showFingering} />
              )}
              <ResultsLayer
                controller={controller}
                award={award?.exerciseId === exercise.id ? award.award : null}
                hidden={resultsHidden}
                continuation={continuation}
                pianoShortcuts={s.pianoShortcuts}
                onNext={nextExercise}
                onRetry={retry}
                onClose={hideResults}
              />
            </div>
            <PracticeBar
              controller={controller}
              continuation={continuation}
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
              hasNext={continuation.next !== null}
              preferFlats={prefersFlats(exercise.key)}
              qwertyBase={s.showQwertyHints && !runtime.keyboard.unavailable?.qwertyHints ? qwertyBase : null}
              markers={runtime.keyboard.markers}
              spelling={runtime.keyboard.spelling}
            />
          </main>
        )}
      </div>
      {!s.setupGuideSeen ? (
        <FirstRunGuide
          settings={s}
          update={update}
          midi={midiService}
          hidden={calibrating}
          onCalibrate={openCalibration}
          onLevelsChanged={reseed}
          onClose={closeSetup}
        />
      ) : audioGuideOpen ? (
        <AudioSetupGuide settings={s} update={update} midi={midiService} hidden={calibrating} onCalibrate={openCalibration} onClose={closeSetup} />
      ) : null}
      {settingsOpen ? (
        <PianoAudioDialog
          settings={s}
          update={update}
          midi={midiService}
          qwertyBase={qwertyBase}
          hidden={calibrating}
          onCalibrate={openCalibration}
          onSetup={openAudioGuide}
          onClose={closeSettings}
        />
      ) : null}
      {calibrating ? (
        <LatencyCalibration
          volume={s.metronomeVolume}
          midiConnected={midiState.inputs.some((i) => i.connected)}
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
  continuation: Continuation;
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
      continuation={props.continuation}
      pianoShortcuts={props.pianoShortcuts}
      onNext={props.onNext}
      onRetry={props.onRetry}
      onClose={props.onClose}
    />
  );
}
