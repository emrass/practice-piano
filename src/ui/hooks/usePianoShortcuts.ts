import { useCallback, useEffect, useMemo } from 'react';
import { type PianoAction, PianoShortcutGate } from '../../core/input/pianoShortcuts';
import { inputBus } from '../../input/inputBus';
import type { Session } from '../practice/session';

/**
 * Piano shortcuts (core/input/pianoShortcuts.ts): after a run, C retries, D goes on, E closes the
 * results, F / G make it easier / harder; a sustain-pedal tap starts Flow or plays the ear phrase.
 */
export function usePianoShortcuts(opts: {
  controller: Session;
  enabled: boolean;
  resultsHidden: boolean;
  retry: () => void;
  nextExercise: () => void;
  hideResults: () => void;
  step: (direction: 1 | -1) => void;
}): void {
  const { controller, enabled, resultsHidden, retry, nextExercise, hideResults, step } = opts;
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
        if (!enabled) return;
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
    [controller, gate, enabled, runPianoAction, resultsHidden],
  );
}
