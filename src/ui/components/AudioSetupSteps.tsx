import { LATENCY_PRESETS, type Settings, type SettingsPatch } from '../../core/settings';
import type { MidiService, MidiState } from '../../platform/midi/midiService';
import { ConnectionStatus } from './MidiConnect';
import { Callout, ChoiceGroup } from './controls';

/** What the piano & audio steps of the setup guides show (their steps are in guideSteps.tsx). */

export function ConnectStep(props: { midi: MidiState; service: MidiService; heard: number | null }) {
  return (
    <>
      <p>
        Practice Piano is made to be played on a <b>real piano or keyboard</b>. It listens to what you play over <b>USB or Bluetooth MIDI</b> and scores your notes and your timing.
      </p>
      <ConnectionStatus {...props} />
    </>
  );
}

export function NoPianoStep() {
  return (
    <>
      <p>
        You can try every lesson with the <b>keys on the screen</b> (mouse or touch) or with your <b>computer keyboard</b>: <kbd>A</kbd>–<kbd>'</kbd> are the white keys,{' '}
        <kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd> <kbd>Y</kbd> <kbd>U</kbd> the black ones. We’ll turn on <b>Key sound</b> so those keys make a sound.
      </p>
      <p>
        It is a way to look around, not to practice: fingering, both hands and playing in time need a real keyboard. When your piano is nearby, press <b>Connect a piano</b> in
        the top bar.
      </p>
    </>
  );
}

export function MetronomeStep(props: { settings: Settings; update: (patch: SettingsPatch) => void; onCalibrate: () => void }) {
  const { settings: s } = props;
  const calibrated = s.audioSetup === 'calibrated' && s.calibration;
  return (
    <>
      <p>
        In <b>Flow</b> mode you play in time with a metronome. Sound takes a moment to travel, longer over Bluetooth. To judge your timing fairly, the app needs to know how late
        the click reaches your ears.
      </p>
      {calibrated ? <Callout tone="success" title={`Calibrated · ${s.calibration!.latencyMs} ms ± ${s.calibration!.spreadMs} ms`} /> : null}
      <button type="button" className={`btn btn-block ${calibrated ? '' : 'btn-primary'}`} onClick={props.onCalibrate}>
        {calibrated ? 'Calibrate again' : 'Calibrate now (about 30 s)'}
      </button>
      <p className="field-hint">You play a key along with a few clicks, and the app measures your exact setup. This is the most accurate option.</p>

      <div className="field">
        <div className="field-label">Or pick the closest setup</div>
        <ChoiceGroup
          label="Or pick the closest setup"
          value={s.audioSetup === 'speakers' || s.audioSetup === 'headphones' ? s.audioSetup : null}
          onChange={(id) => props.update({ audioSetup: id, latencyMs: LATENCY_PRESETS[id].latencyMs, playheadDelayMs: LATENCY_PRESETS[id].playheadDelayMs })}
          options={(['speakers', 'headphones'] as const).map((id) => ({
            value: id,
            name: `${LATENCY_PRESETS[id].label} · ${LATENCY_PRESETS[id].latencyMs} ms`,
            description: LATENCY_PRESETS[id].help,
          }))}
        />
      </div>
      <p className="field-hint">
        This only matters in Flow mode. You can change it any time in <b>Piano &amp; audio</b>, from the piano button in the top bar.
      </p>
    </>
  );
}
