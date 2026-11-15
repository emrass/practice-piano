import { useEffect, useRef } from 'react';
import { KEYBOARD_RANGES, KEYBOARD_SIZES, type KeyboardSize } from '../../core/keyboard/range';
import { midiLabel } from '../../core/music/pitch';
import { LATENCY_PRESETS, type Settings, type SettingsPatch } from '../../core/settings';
import { useStore } from '../../lib/store';
import { audioEngine } from '../../platform/audio/audioEngine';
import type { MidiService } from '../../platform/midi/midiService';
import { useHeardNote } from '../hooks/useHeardNote';
import { BrowserBluetoothHelp, ConnectionStatus, MidiButtons } from './MidiConnect';
import { connectedInputs } from './midiStatus';
import { CommitSlider, Field, Segmented, Select, Toggle } from './controls';

const BACKEND_TEXT = {
  webmidi: 'Web MIDI',
  native: 'CoreMIDI (native app)',
  none: 'No MIDI support',
} as const;

/**
 * Piano & audio: the settings that apply to every lesson (the piano, timing and sound, how
 * playing is scored). Opened from the piano chip in the top bar, connected or not.
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
  const card = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!hidden) card.current?.focus();
  }, [hidden]);

  if (hidden) return null;

  const connected = connectedInputs(midi).length > 0;

  return (
    <div className="modal-backdrop is-sheet" role="dialog" aria-modal="true" aria-labelledby="piano-audio-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card settings" ref={card} tabIndex={-1}>
        <div className="modal-head settings-head">
          <h2 id="piano-audio-title">Piano &amp; audio</h2>
          <button type="button" className="icon-btn" aria-label="Close Piano & audio" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="settings-scroll">
          <section className="panel-section" aria-labelledby="settings-piano">
            <div className="section-title" id="settings-piano">
              Piano <span className="muted">· {BACKEND_TEXT[midi.backend]}</span>
            </div>
            <div className="connect-status">
              <ConnectionStatus midi={midi} service={props.midi} heard={heard} />
            </div>
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
                  <details className="help">
                    <summary>Bluetooth MIDI in the browser</summary>
                    <p>
                      <BrowserBluetoothHelp />
                    </p>
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
          </section>

          <section className="panel-section" aria-labelledby="settings-timing">
            <div className="section-title" id="settings-timing">
              Audio &amp; timing
            </div>
            <p className={`status-line ${s.calibration ? 'is-ok' : ''}`}>
              {s.audioSetup === 'calibrated' && s.calibration
                ? `Calibrated ${new Date(s.calibration.at).toLocaleDateString()} · ${s.calibration.latencyMs} ms ± ${s.calibration.spreadMs} ms`
                : s.audioSetup === 'custom'
                  ? 'Custom values'
                  : `Preset: ${LATENCY_PRESETS[s.audioSetup === 'headphones' ? 'headphones' : 'speakers'].label}`}
            </p>
            <button type="button" className="btn btn-primary btn-block" onClick={props.onCalibrate}>
              Calibrate latency…
            </button>
            <p className="field-hint">Tap along with a click on your piano; we measure the delay of your exact setup (Bluetooth MIDI, Bluetooth audio, speakers…).</p>
            <Field label="Quick presets">
              <div className="button-row">
                {(['speakers', 'headphones'] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`btn btn-small ${s.audioSetup === id ? 'is-selected' : ''}`}
                    title={LATENCY_PRESETS[id].help}
                    onClick={() => update({ audioSetup: id, latencyMs: LATENCY_PRESETS[id].latencyMs, playheadDelayMs: LATENCY_PRESETS[id].playheadDelayMs })}
                  >
                    {LATENCY_PRESETS[id].label} · {LATENCY_PRESETS[id].latencyMs} ms
                  </button>
                ))}
              </div>
            </Field>
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
                className="btn btn-small"
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
          </section>

          <section className="panel-section" aria-labelledby="settings-playing">
            <div className="section-title" id="settings-playing">
              Playing
            </div>
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
            <CommitSlider label="Chord grace window" min={30} max={150} step={5} value={s.chordGraceMs} onCommit={(chordGraceMs) => update({ chordGraceMs })} format={(v) => `${v} ms`} />
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
          </section>

          <section className="panel-section" aria-labelledby="settings-guide">
            <div className="section-title" id="settings-guide">
              Setup guide
            </div>
            <p className="field-hint">The first-run walkthrough: connect your piano, set your playing level, line up the metronome.</p>
            <button type="button" className="btn btn-block" onClick={props.onSetup}>
              Run setup guide again…
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
