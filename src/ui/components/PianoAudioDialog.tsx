import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
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

type Tab = 'piano' | 'audio' | 'playing';

const TABS: { id: Tab; label: string }[] = [
  { id: 'piano', label: 'Piano' },
  { id: 'audio', label: 'Audio & timing' },
  { id: 'playing', label: 'Playing' },
];

// TEMPORARY (design review): where "Run setup guide again" lives. Picked with ?setup=… in the URL.
type SetupPlacement = 'header' | 'footer' | 'tabs' | 'subtitle';
const SETUP_PLACEMENT: SetupPlacement = ((): SetupPlacement => {
  const v = new URLSearchParams(window.location.search).get('setup');
  return v === 'footer' || v === 'tabs' || v === 'subtitle' ? v : 'header';
})();

/**
 * Piano & audio: the settings that apply to every lesson (the piano, timing and sound, how
 * playing is scored), one tab each. Opened from the piano chip in the top bar, connected or
 * not, always on the Piano tab.
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
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
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

  useEffect(() => {
    if (!hidden) card.current?.focus();
  }, [hidden]);

  if (hidden) return null;

  const connected = connectedInputs(midi).length > 0;

  // Arrow keys, Home and End move between tabs (the WAI-ARIA tabs pattern).
  const onTabKey = (e: ReactKeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next =
      e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  };

  const setupButton = (className: string, label = 'Run setup guide again…') => (
    <button type="button" className={className} onClick={props.onSetup}>
      {label}
    </button>
  );

  return (
    <div className="modal-backdrop is-sheet" role="dialog" aria-modal="true" aria-labelledby="piano-audio-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-card settings" ref={card} tabIndex={-1}>
        <div className="modal-head settings-head">
          <div className="settings-title">
            <h2 id="piano-audio-title">Piano &amp; audio</h2>
            {SETUP_PLACEMENT === 'subtitle' ? (
              <p className="settings-subtitle">
                Applies to every lesson ·{' '}
                <button type="button" className="link-btn" onClick={props.onSetup}>
                  Run setup guide again
                </button>
              </p>
            ) : null}
          </div>
          <div className="settings-head-actions">
            {SETUP_PLACEMENT === 'header' ? setupButton('btn btn-small', 'Setup guide…') : null}
            <button type="button" className="icon-btn" aria-label="Close Piano & audio" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="settings-tabs">
          <div className="settings-tablist" role="tablist" aria-label="Piano & audio" onKeyDown={onTabKey}>
            {TABS.map((t) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[t.id] = el;
                }}
                type="button"
                role="tab"
                id={`${ids}-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`${ids}-panel`}
                tabIndex={tab === t.id ? 0 : -1}
                className={tab === t.id ? 'is-active' : ''}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {SETUP_PLACEMENT === 'tabs' ? setupButton('link-btn settings-tabs-setup', 'Setup guide…') : null}
        </div>

        <div className="settings-scroll" role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-tab-${tab}`}>
          {tab === 'piano' ? (
            <section className="panel-section">
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
              <p className="field-hint">MIDI: {BACKEND_TEXT[midi.backend]}</p>
            </section>
          ) : null}

          {tab === 'audio' ? (
            <section className="panel-section">
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
          ) : null}

          {tab === 'playing' ? (
            <section className="panel-section">
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
          ) : null}
        </div>

        {SETUP_PLACEMENT === 'footer' ? (
          <div className="settings-foot">
            <span className="field-hint">Connect your piano, set your level, line up the metronome.</span>
            {setupButton('btn btn-small', 'Run setup guide…')}
          </div>
        ) : null}
      </div>
    </div>
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
    <div className={`status-line calib-row ${calibrated ? 'is-ok' : ''}`}>
      <div className="calib-row-text">
        <b>{title}</b>
        <span>{detail}</span>
      </div>
      <button type="button" className={`btn btn-small ${calibrated ? '' : 'btn-primary'}`} onClick={props.onCalibrate}>
        {calibrated ? 'Calibrate again…' : 'Calibrate…'}
      </button>
    </div>
  );
}
