import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Exercise } from '../../core/exercise';
import { SHORTCUT_ARM_MS } from '../../core/input/pianoShortcuts';
import { clampQwertyBase, OCTAVE_DOWN_CODE, OCTAVE_UP_CODE, qwertyBaseFor, qwertyToMidi, RESTART_CODE } from '../../core/input/qwerty';
import { inputBus } from '../../input/inputBus';
import { isUntouched, type Session } from '../practice/session';

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || t.isContentEditable;
}

/**
 * The computer keyboard: piano keys (core/input/qwerty.ts, Z / X shift the octave, Shift is the
 * sustain pedal) and the practice shortcuts (Space, Enter, N, Backspace, R, ?, Escape). Returns
 * the C the piano keys start from, for the key hints.
 *
 * Backspace restarts at any time. R sits between the black keys E and T, so it restarts only after
 * the run, once the same short delay as the piano shortcuts has passed: a slip while playing, or
 * at the very end, never throws the run away.
 *
 * The listeners are attached once per mount and read the current exercise and session when a key
 * is pressed, so a new exercise or an octave shift never releases keys still held.
 */
export function useComputerKeyboard(opts: {
  controller: Session;
  exercise: Exercise;
  /** Replaces the piano layout (rhythm: J / F play its two keys). */
  rhythmQwerty?: ReadonlyMap<string, number>;
  /** A dialog (latency calibration, setup guide) is open: it captures input and handles Escape itself. */
  dialogOpen: boolean;
  startStop: () => void;
  nextExercise: () => void;
  retry: () => void;
  /** Enter after a run: what the lesson suggests. */
  continueRun: () => void;
  hint: () => void;
  hideResults: () => void;
}): number {
  const { controller, exercise, rhythmQwerty, dialogOpen, startStop, nextExercise, retry, continueRun, hint, hideResults } = opts;
  const [qwertyShift, setQwertyShift] = useState<{ exerciseId: string; base: number } | null>(null);
  const qwertyBase = qwertyShift?.exerciseId === exercise.id ? qwertyShift.base : qwertyBaseFor(exercise.range.min, exercise.range.max);
  const keyToMidi = (code: string) => (rhythmQwerty ? (rhythmQwerty.get(code) ?? null) : qwertyToMidi(code, qwertyBase));

  // When the current run ended (performance.now()), for R's delay. Null: not seen, R works at once.
  const finishedAt = useRef<number | null>(null);
  useEffect(() => {
    finishedAt.current = null;
    return controller.finished.on(() => {
      finishedAt.current = performance.now();
    });
  }, [controller]);

  const onKeyDown = useEffectEvent((e: KeyboardEvent, down: Map<string, number>) => {
    if (dialogOpen) return; // the dialog captures input and handles Escape itself
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
      continueRun();
      return;
    }
    if (e.code === 'KeyN') return nextExercise();
    if (e.code === 'KeyR') {
      // Mid-run R is a missed note, not a command (core/input/qwerty.ts).
      const armed = finishedAt.current === null || performance.now() - finishedAt.current >= SHORTCUT_ARM_MS;
      if (finished && armed) retry();
      return;
    }
    if (e.code === RESTART_CODE) {
      e.preventDefault();
      const st = controller.state.get();
      if (finished || st.mode !== 'wait') return retry();
      // A Wait run restarts in place; an untouched one has nothing to restart.
      if (!isUntouched(st)) controller.start();
      return;
    }
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
    down.set(e.code, midi);
    inputBus.publish({ kind: 'noteOn', midi, velocity: 80, time: performance.now(), source: 'qwerty' });
  });
  const onKeyUp = useEffectEvent((e: KeyboardEvent, down: Map<string, number>) => {
    if (dialogOpen && !down.has(e.code) && e.key !== 'Shift') return;
    if (e.code === 'Space') e.preventDefault();
    if (e.key === 'Shift') {
      inputBus.publish({ kind: 'sustain', down: false, time: performance.now(), source: 'qwerty' });
      return;
    }
    const midi = down.get(e.code);
    if (midi === undefined) return;
    down.delete(e.code);
    inputBus.publish({ kind: 'noteOff', midi, time: performance.now(), source: 'qwerty' });
  });

  useEffect(() => {
    // Held keys and the note each one plays (the octave can shift while a key is held).
    const down = new Map<string, number>();
    const keyDown = (e: KeyboardEvent) => onKeyDown(e, down);
    const keyUp = (e: KeyboardEvent) => onKeyUp(e, down);
    const onBlur = () => {
      down.clear();
      inputBus.releaseAll('qwerty', performance.now());
      inputBus.releaseAll('screen', performance.now());
    };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', onBlur);
      onBlur();
    };
  }, []);

  return qwertyBase;
}
