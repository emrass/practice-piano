import { midiLabel } from '../../core/music/pitch';
import type { MidiService, MidiState } from '../../platform/midi/midiService';
import { Callout } from './controls';
import { connectedInputs, midiStatusText } from './midiStatus';

/** Connecting a piano: what the Piano & audio settings and the setup guide share (texts in midiStatus.ts). */

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
      On macOS, pair the piano once in <b>Audio MIDI Setup → Window → Show MIDI Studio → Bluetooth</b> (the “Bluetooth” toolbar button), then press Rescan here. On iPad, browsers
      can’t use MIDI — install the practice-piano app, which has a built-in pairing button.
    </>
  );
}

/**
 * Where the connection stands and what to do about it: the piano that was found (play a key to
 * check it), how to connect one over USB or Bluetooth, or why this browser can't.
 */
export function ConnectionStatus(props: { midi: MidiState; service: MidiService; heard: number | null }) {
  const { midi, heard } = props;
  const connected = connectedInputs(midi);
  const names = connected.map((i) => i.name).join(', ');

  if (connected.length) {
    return (
      <div aria-live="polite">
        {heard !== null ? (
          <Callout tone="success" title={`We hear you: ${midiLabel(heard)}`}>
            On {midi.lastInputName ?? names}. Your piano is ready.
          </Callout>
        ) : (
          <Callout title={`Found ${names}`}>Play any key on it to check the connection.</Callout>
        )}
      </div>
    );
  }

  if (midi.status === 'unsupported') {
    return (
      <Callout tone="warning" title="This browser can’t connect to a piano">
        <ul>
          <li>
            On a computer, open this page in <b>Chrome</b> or <b>Edge</b>.
          </li>
          <li>
            On an iPad or iPhone, use the <b>Practice Piano app</b>: browsers there cannot use MIDI.
          </li>
        </ul>
      </Callout>
    );
  }

  if (midi.status === 'ready') {
    return (
      <>
        <Callout title="No piano found yet" />
        <ul className="setup-ways">
          <li>
            <b>USB</b>
            <span>Connect the piano’s USB port (“USB to Host”) to this device and switch the piano on. It shows up here by itself.</span>
          </li>
          <li>
            <b>Bluetooth</b>
            <span>{midi.canPairBluetooth ? 'Press Pair Bluetooth MIDI and choose your piano from the list.' : <BrowserBluetoothHelp />}</span>
          </li>
        </ul>
        <div className="button-row">
          <MidiButtons midi={props.service} canPairBluetooth={midi.canPairBluetooth} />
        </div>
      </>
    );
  }

  return (
    <>
      <Callout tone={midi.status === 'initializing' ? undefined : 'warning'} title={midiStatusText(midi)} />
      {midi.status === 'initializing' ? (
        <p className="field-hint">If your browser asks whether this site may use MIDI devices, choose Allow.</p>
      ) : (
        <div className="button-row">
          <MidiButtons midi={props.service} canPairBluetooth={midi.canPairBluetooth} />
        </div>
      )}
    </>
  );
}
