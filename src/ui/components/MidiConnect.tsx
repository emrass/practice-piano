import type { MidiService } from '../../platform/midi/midiService';

/** Connecting a piano: the controls the Input & audio panel and the setup guide share (texts in midiStatus.ts). */

/** Rescan, and in the native app the Bluetooth pairing sheet. */
export function MidiButtons(props: { midi: MidiService; canPairBluetooth: boolean }) {
  return (
    <>
      <button type="button" className="btn" onClick={() => void props.midi.rescan()}>
        Rescan
      </button>
      {props.canPairBluetooth ? (
        <button type="button" className="btn btn-primary" onClick={() => props.midi.pairBluetooth()}>
          Pair Bluetooth MIDI…
        </button>
      ) : null}
    </>
  );
}

/** How to pair a Bluetooth piano where the app cannot do it itself (a browser). */
export function BrowserBluetoothHelp() {
  return (
    <>
      On macOS, pair the piano once in <b>Audio MIDI Setup → Window → Show MIDI Studio → Bluetooth</b> (the “Bluetooth” toolbar button), then press Rescan here. On
      iPad, browsers can’t use MIDI — install the practice-piano app, which has a built-in pairing button.
    </>
  );
}
