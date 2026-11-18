// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateExercise } from '../../core/generator/generator';
import { SHORTCUT_ARM_MS } from '../../core/input/pianoShortcuts';
import { inputBus } from '../../input/inputBus';
import type { AudioEngine } from '../../platform/audio/audioEngine';
import { PracticeController } from '../practice/PracticeController';
import type { Session } from '../practice/session';
import { useComputerKeyboard } from './useComputerKeyboard';

const fakeAudio = { ensure: () => null, click: () => {}, toContextTime: () => 0 } as unknown as AudioEngine;

function session(seed: number): Session {
  const exercise = generateExercise(
    { level: 20, hands: 'both', bars: 4, keyId: 'auto', timeSignature: 'auto', rhythmComplexity: 'auto', maxPolyphony: 'auto', bpm: null, keyboardSize: 88 },
    seed,
  );
  return new PracticeController(
    { exercise, mode: 'wait', graceMs: 75, sustainCountsAsHeld: false, latencyMs: 0, playheadDelayMs: 0, metronomeVolume: 0, countInBars: 1 },
    inputBus,
    fakeAudio,
  );
}

function renderKeyboard(controller: Session) {
  const actions = { startStop: vi.fn(), nextExercise: vi.fn(), retry: vi.fn(), continueRun: vi.fn(), hint: vi.fn(), hideResults: vi.fn() };
  return Object.assign(renderHook(
    (p: { controller: Session; dialogOpen: boolean }) =>
      useComputerKeyboard({ controller: p.controller, exercise: p.controller.exercise, dialogOpen: p.dialogOpen, ...actions }),
    { initialProps: { controller, dialogOpen: false } },
  ), { actions });
}

function press(type: 'keydown' | 'keyup', code: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, { code }));
  });
}

const held = () => inputBus.held.get().held;

/** Ends the run as the session would: status finished, then the finished event, at `time`. */
function finish(controller: Session, time: number) {
  vi.spyOn(performance, 'now').mockReturnValue(time);
  act(() => {
    controller.state.set((s) => ({ ...s, status: 'finished' }));
    controller.finished.emit(null as never);
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useComputerKeyboard', () => {
  it('attaches its listeners once, not per exercise, octave shift or calibration', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { rerender, unmount } = renderKeyboard(session(1));
    press('keydown', 'KeyX');
    rerender({ controller: session(2), dialogOpen: false });
    rerender({ controller: session(2), dialogOpen: true });
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0);
    unmount();
    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);
    add.mockRestore();
    remove.mockRestore();
  });

  it('keeps a note held on the on-screen keys through an octave shift and a new exercise', () => {
    const { result, rerender } = renderKeyboard(session(1));
    inputBus.publish({ kind: 'noteOn', midi: 60, velocity: 80, time: 0, source: 'screen' });
    const base = result.current;
    press('keydown', 'KeyX');
    press('keyup', 'KeyX');
    expect(result.current).toBe(base + 12);
    rerender({ controller: session(2), dialogOpen: false });
    expect(held()).toEqual([60]);
  });

  it('releases the note a computer key played, even after the octave has shifted', () => {
    const { result } = renderKeyboard(session(1));
    const base = result.current;
    press('keydown', 'KeyA');
    expect(held()).toEqual([base]);
    press('keydown', 'KeyX');
    expect(held()).toEqual([base]);
    press('keyup', 'KeyA');
    expect(held()).toEqual([]);
  });

  describe('Restart', () => {
    it('R does nothing during a run: it sits among the black keys, so it is a missed note', () => {
      for (const mode of ['wait', 'flow'] as const) {
        const controller = session(1);
        controller.state.set((s) => ({ ...s, mode, status: 'running' }));
        const start = vi.spyOn(controller, 'start');
        const { actions, unmount } = renderKeyboard(controller);
        press('keydown', 'KeyA'); // a note played, so a Wait run is no longer untouched
        press('keyup', 'KeyA');
        press('keydown', 'KeyR');
        expect(actions.retry).not.toHaveBeenCalled();
        expect(start).not.toHaveBeenCalled();
        unmount();
      }
    });

    it('R restarts after a run, once the shortcut delay has passed', () => {
      const controller = session(1);
      const { actions } = renderKeyboard(controller);
      finish(controller, 1000);
      vi.spyOn(performance, 'now').mockReturnValue(1000 + SHORTCUT_ARM_MS - 1);
      press('keydown', 'KeyR');
      press('keyup', 'KeyR');
      expect(actions.retry).not.toHaveBeenCalled();
      vi.spyOn(performance, 'now').mockReturnValue(1000 + SHORTCUT_ARM_MS);
      press('keydown', 'KeyR');
      expect(actions.retry).toHaveBeenCalledTimes(1);
    });

    it('Backspace restarts at any time: Flow mid-run, a touched Wait run in place, and after a run', () => {
      const flow = session(1);
      flow.state.set((s) => ({ ...s, mode: 'flow', status: 'running' }));
      const a = renderKeyboard(flow);
      press('keydown', 'Backspace');
      expect(a.actions.retry).toHaveBeenCalledTimes(1);
      a.unmount();

      const wait = session(2);
      wait.state.set((s) => ({ ...s, mode: 'wait', status: 'running' }));
      const start = vi.spyOn(wait, 'start');
      const b = renderKeyboard(wait);
      press('keydown', 'Backspace'); // untouched: nothing to restart
      press('keyup', 'Backspace');
      expect(start).not.toHaveBeenCalled();
      wait.state.set((s) => ({ ...s, live: { ...s.live, wrong: 1 } }));
      press('keydown', 'Backspace');
      press('keyup', 'Backspace');
      expect(start).toHaveBeenCalledTimes(1);
      expect(b.actions.retry).not.toHaveBeenCalled();

      finish(wait, 1000);
      press('keydown', 'Backspace'); // no delay: Backspace is never a note
      expect(b.actions.retry).toHaveBeenCalledTimes(1);
    });
  });
});
