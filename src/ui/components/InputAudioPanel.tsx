import { midiLabel } from '../../core/music/pitch';
import { LATENCY_PRESETS, type Settings } from '../../core/settings';
import { useStore } from '../../lib/store';
import { inputBus } from '../../input/inputBus';
import { audioEngine } from '../../platform/audio/audioEngine';
import type { MidiService } from '../../platform/midi/midiService';
import { CommitSlider, Field, Segmented, Select, Toggle } from './controls';

const BACKEND_TEXT = {
  webmidi: 'Web MIDI',
  native: 'CoreMIDI (native app)',
  none: 'No MIDI support',
} as const;

/** Held keys; spelled with flats in flat keys, like the on-screen keyboard. */
export function InputMonitor(props: { preferFlats?: boolean }) {
  const held = useStore(inputBus.held);
  return (
    <div className="monitor" aria-live="polite">
      <div className={`pedal ${held.sustain ? 'is-down' : ''}`} title="Sustain pedal (CC 64)">
        <span className="pedal-icon" aria-hidden="true" />
        <span>{held.sustain ? 'Pedal down' : 'Pedal up'}</span>
      </div>
      <div className="held-notes">
        {held.held.length === 0 && held.sustained.length === 0 ? <span className="muted">No keys held</span> : null}
        {held.held.map((m) => (
          <span key={m} className="note-chip">
            {midiLabel(m, props.preferFlats)}
          </span>
        ))}
        {held.sustained.map((m) => (
          <span key={`s${m}`} className="note-chip is-sustained" title="Sounding via sustain pedal">
            {midiLabel(m, props.preferFlats)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function InputAudioPanel(props: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  midi: MidiService;
  qwertyBase: number;
  onCalibrate: () => void;
}) {
  const { settings: s, update } = props;
  const midi = useStore(props.midi.state);
  const connected = midi.inputs.filter((i) => i.connected);

  const statusText =
    midi.status === 'initializing'
      ? 'Looking for MIDI…'
      : midi.status === 'denied'
        ? 'MIDI access was blocked. Allow MIDI for this site in Chrome’s site settings, then Rescan.'
        : midi.status === 'unsupported'
          ? midi.backend === 'none'
            ? 'This browser has no Web MIDI. Use Chrome on macOS, or the iPad/Mac app.'
            : 'MIDI is not available in this context.'
          : midi.status === 'error'
            ? 'MIDI could not be started.'
            : connected.length
              ? `${connected.length} input${connected.length > 1 ? 's' : ''} connected`
              : 'No MIDI inputs found — connect your piano (USB or Bluetooth) and Rescan.';

  return (
    <div className="panel-body">
      <section className="panel-section">
        <div className="section-title">
          MIDI input <span className="muted">· {BACKEND_TEXT[midi.backend]}</span>
        </div>
        <p className={`status-line ${connected.length ? 'is-ok' : ''}`}>{statusText}</p>
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
        <div className="button-row">
          <button type="button" className="btn" onClick={() => void props.midi.rescan()}>
            Rescan
          </button>
          {midi.canPairBluetooth ? (
            <button type="button" className="btn btn-primary" onClick={() => props.midi.pairBluetooth()}>
              Pair Bluetooth MIDI…
            </button>
          ) : null}
        </div>
        {!midi.canPairBluetooth ? (
          <details className="help">
            <summary>Bluetooth MIDI in the browser</summary>
            <p>
              On macOS, pair the piano once in <b>Audio MIDI Setup → Window → Show MIDI Studio → Bluetooth</b> (the “Bluetooth” toolbar button), then press Rescan here.
              On iPad, browsers can’t use MIDI — install the practice-piano app, which has a built-in pairing button.
            </p>
          </details>
        ) : null}
        <div className="field-label">Live input</div>
        <InputMonitor />
      </section>

      <section className="panel-section">
        <div className="section-title">Scoring</div>
        <Field label="Sustain pedal" hint="“Count as held” lets pedalled notes satisfy chords and note lengths.">
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
      </section>

      <section className="panel-section">
        <div className="section-title">Audio & latency</div>
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

      <section className="panel-section">
        <div className="section-title">Piano shortcuts</div>
        <Toggle
          label="Navigate from the piano"
          hint="After an exercise: C retry · D next · E close · F easier · G harder. In Flow mode, tap the sustain pedal to start."
          checked={s.pianoShortcuts}
          onChange={(pianoShortcuts) => update({ pianoShortcuts })}
        />
      </section>

      <section className="panel-section">
        <div className="section-title">On-screen &amp; computer keys</div>
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
    </div>
  );
}
