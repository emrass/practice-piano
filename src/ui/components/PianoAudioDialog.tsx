import { useEffect, useId, useState } from 'react';
import { KEYBOARD_RANGES, KEYBOARD_SIZES, type KeyboardSize } from '../../core/keyboard/range';
import { midiLabel } from '../../core/music/pitch';
import { LATENCY_PRESETS, type Settings, type SettingsPatch } from '../../core/settings';
import { useStore } from '../../lib/store';
import { audioEngine } from '../../platform/audio/audioEngine';
import type { MidiService } from '../../platform/midi/midiService';
import { useHeardNote } from '../hooks/useHeardNote';
import { BrowserBluetoothHelp, ConnectionStatus, MidiButtons } from './MidiConnect';
import { connectedInputs } from './midiStatus';
import { Callout, CommitSlider, Field, Segmented, Select, Tabs, Toggle } from './controls';
import { Dialog } from './Dialog';

const BACKEND_TEXT = {
  webmidi: 'Web MIDI',
  native: 'CoreMIDI (native app)',
  none: 'No MIDI support',
} as const;

type Tab = 'piano' | 'audio' | 'playing';

const TABS: { id: Tab; label: string }[] = [
  { id: 'piano', label: 'Piano' },
  { id: 'audio', label: 'Audio & timing' },
  { id: 'playing', label: 'Playing' },
];

/**
 * Piano & audio: the settings that apply to every lesson (the piano, timing and sound, how
 * playing is scored), one tab each, and the setup guide in the header. Opened from the piano
 * chip in the top bar, connected or not, always on the Piano tab.
 */
export function PianoAudioDialog(props: {
  settings: Settings;
  update: (patch: SettingsPatch) => void;
  midi: MidiService;
  qwertyBase: number;
  /** The calibration dialog is on top; this one waits underneath with its state kept. */
  hidden: boolean;
  onCalibrate: () => void;
  /** Runs the first-run setup guide again (this dialog closes). */
  onSetup: () => void;
  onClose: () => void;
}) {
  const { settings: s, update, hidden, onClose } = props;
  const midi = useStore(props.midi.state);
  const [tab, setTab] = useState<Tab>('piano');
  const ids = useId();
  // A key played to check the connection must not reach the exercise underneath.
  const heard = useHeardNote(!hidden);

  useEffect(() => {
    if (hidden) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hidden, onClose]);

  if (hidden) return null;

  const connected = connectedInputs(midi).length > 0;

  return (
    <Dialog
      title="Piano & audio"
      closeLabel="Close Piano & audio"
      onClose={onClose}
      dismissible
      sheet
      tabbed
      className="settings"
      headActions={
        <button type="button" className="btn btn-sm" title="Run the first-run setup guide again" onClick={props.onSetup}>
          Setup guide…
        </button>
      }
    >
      <Tabs<Tab> label="Piano & audio" idBase={ids} tabs={TABS} value={tab} onChange={setTab} />

      <div className="dialog-body" role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-tab-${tab}`}>
        {tab === 'piano' ? (
          <>
            <ConnectionStatus midi={midi} service={props.midi} heard={heard} />
            {midi.inputs.length ? (
              <Select
                label="Device"
                value={midi.selectedId}
                onChange={(id) => {
                  props.midi.select(id);
                  update({ midiInputId: id });
                }}
                options={[
                  { value: 'auto', label: 'Auto — all connected inputs' },
                  ...midi.inputs.map((i) => ({ value: i.id, label: `${i.name}${i.connected ? '' : ' (offline)'}` })),
                ]}
              />
            ) : null}
            {/* Without a piano, the connection help above has these buttons already. */}
            {connected ? (
              <>
                <div className="button-row">
                  <MidiButtons midi={props.midi} canPairBluetooth={midi.canPairBluetooth} />
                </div>
                {!midi.canPairBluetooth ? (
                  <details className="disclosure">
                    <summary>Bluetooth MIDI in the browser</summary>
                    <div className="disclosure-body">
                      <p className="field-hint">
                        <BrowserBluetoothHelp />
                      </p>
                    </div>
                  </details>
                ) : null}
              </>
            ) : null}
            <Select<KeyboardSize>
              label="Your keyboard"
              value={s.keyboardSize}
              onChange={(keyboardSize) => update({ keyboardSize })}
              options={KEYBOARD_SIZES.map((k) => ({ value: k, label: KEYBOARD_RANGES[k].label }))}
            />
            <p className="field-hint">Sight reading keeps its passages within your keyboard’s range.</p>
            <p className="field-hint">MIDI: {BACKEND_TEXT[midi.backend]}</p>
          </>
        ) : null}

        {tab === 'audio' ? (
          <>
            <CalibrationRow settings={s} onCalibrate={props.onCalibrate} />
            <p className="field-hint">Tap along with a click on your piano; we measure the delay of your exact setup (Bluetooth MIDI, Bluetooth audio, speakers…).</p>
            <CommitSlider
              label="Latency compensation"
              min={0}
              max={300}
              step={5}
              value={s.latencyMs}
              onCommit={(latencyMs) => update({ latencyMs, audioSetup: 'custom' })}
              format={(v) => `${v} ms`}
            />
            <CommitSlider
              label="Playhead delay"
              min={0}
              max={300}
              step={5}
              value={s.playheadDelayMs}
              onCommit={(playheadDelayMs) => update({ playheadDelayMs, audioSetup: 'custom' })}
              format={(v) => (v === 0 ? 'Off' : `${v} ms`)}
            />
            <p className="field-hint">The playhead lags by this much so it lines up with a click you hear late (e.g. over Bluetooth).</p>
            <div className="bpm-row">
              <CommitSlider
                label="Metronome volume"
                min={0}
                max={100}
                step={5}
                value={Math.round(s.metronomeVolume * 100)}
                onCommit={(v) => update({ metronomeVolume: v / 100 })}
                format={(v) => `${v}%`}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => {
                  audioEngine.ensure();
                  const now = performance.now() + 60;
                  [0, 1, 2, 3].forEach((i) => audioEngine.click(now + i * 400, i === 0, s.metronomeVolume));
                }}
              >
                Test
              </button>
            </div>
            <Field label="Count-in">
              <Segmented<number>
                label="Count-in bars"
                value={s.countInBars}
                onChange={(v) => update({ countInBars: v as 1 | 2 })}
                options={[
                  { value: 1, label: '1 bar' },
                  { value: 2, label: '2 bars' },
                ]}
              />
            </Field>
          </>
        ) : null}

        {tab === 'playing' ? (
          <>
            <Field label="Sustain pedal" hint="“Count as held” lets pedaled notes satisfy chords and note lengths.">
              <Segmented<Settings['sustainScoring']>
                label="Sustain pedal scoring"
                value={s.sustainScoring}
                onChange={(sustainScoring) => update({ sustainScoring })}
                options={[
                  { value: 'ignore', label: 'Ignore' },
                  { value: 'hold', label: 'Count as held' },
                ]}
              />
            </Field>
            <CommitSlider
              label="Chord grace window"
              min={30}
              max={150}
              step={5}
              value={s.chordGraceMs}
              onCommit={(chordGraceMs) => update({ chordGraceMs })}
              format={(v) => `${v} ms`}
            />
            <Toggle
              label="Navigate from the piano"
              hint="After an exercise: C restart · D next · E close · F easier · G harder. In Flow mode, tap the sustain pedal to start."
              checked={s.pianoShortcuts}
              onChange={(pianoShortcuts) => update({ pianoShortcuts })}
            />
            <Toggle
              label="Key sound"
              hint="Play a piano sound for the on-screen and computer keys. Off by default so it doesn't double a MIDI piano."
              checked={s.keySound}
              onChange={(keySound) => update({ keySound })}
            />
            <p className="field-hint">
              Play with <kbd>A</kbd>–<kbd>'</kbd> (white keys) and <kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd> <kbd>Y</kbd> <kbd>U</kbd> <kbd>O</kbd> <kbd>P</kbd> (black keys).
              <kbd>Z</kbd>/<kbd>X</kbd> shift octave — <kbd>A</kbd> is currently <b>{midiLabel(props.qwertyBase)}</b>. <kbd>Shift</kbd> works as a sustain pedal.
            </p>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Where the timing stands (calibrated, set by hand, or a setup-guide preset) and the way to measure it. */
function CalibrationRow(props: { settings: Settings; onCalibrate: () => void }) {
  const { settings: s } = props;
  const calibrated = s.audioSetup === 'calibrated' && s.calibration ? s.calibration : null;
  const [title, detail] = calibrated
    ? [`Calibrated · ${calibrated.latencyMs} ms ± ${calibrated.spreadMs} ms`, `Measured ${new Date(calibrated.at).toLocaleDateString()}`]
    : s.audioSetup === 'custom'
      ? ['Set by hand', 'Not calibrated']
      : ['Not calibrated', `Using the “${LATENCY_PRESETS[s.audioSetup === 'headphones' ? 'headphones' : 'speakers'].label}” estimate`];
  return (
    <Callout
      className="calib-row"
      tone={calibrated ? 'success' : undefined}
      title={title}
      action={
        <button type="button" className={`btn btn-sm ${calibrated ? '' : 'btn-primary'}`} onClick={props.onCalibrate}>
          {calibrated ? 'Calibrate again…' : 'Calibrate…'}
        </button>
      }
    >
      {detail}
    </Callout>
  );
}
