import type { MidiState } from '../../platform/midi/midiService';

export function connectedInputs(midi: MidiState) {
  return midi.inputs.filter((i) => i.connected);
}

/** One line on where MIDI stands: looking, blocked, not possible here, or what is connected. */
export function midiStatusText(midi: MidiState): string {
  const connected = connectedInputs(midi);
  if (midi.status === 'initializing') return 'Looking for MIDI…';
  if (midi.status === 'denied') return 'MIDI access was blocked. Allow MIDI for this site in Chrome’s site settings, then Rescan.';
  if (midi.status === 'unsupported') {
    return midi.backend === 'none' ? 'This browser has no Web MIDI. Use Chrome on macOS, or the iPad/Mac app.' : 'MIDI is not available in this context.';
  }
  if (midi.status === 'error') return 'MIDI could not be started.';
  if (connected.length) return `${connected.length} input${connected.length > 1 ? 's' : ''} connected`;
  return 'No MIDI inputs found — connect your piano (USB or Bluetooth) and Rescan.';
}
