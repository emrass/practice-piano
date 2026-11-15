import { useEffect, useState } from 'react';
import { inputBus } from '../../input/inputBus';

/**
 * Takes all input while a dialog is open, so a key played to check the connection is not
 * scored by the exercise underneath. Returns the last MIDI note heard (null until one is).
 */
export function useHeardNote(active: boolean): number | null {
  const [heard, setHeard] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    return inputBus.capture((ev) => {
      if (ev.kind === 'noteOn' && ev.source === 'midi') setHeard(ev.midi);
    });
  }, [active]);
  return heard;
}
