import { useEffect, useRef, useState } from 'react';
import { EXPERIENCE_SKILLS, experiencePatch, type ExperienceSelection, sameSelection, SKILLS, stageOf, STAGES } from '../../core/experience';
import { midiLabel } from '../../core/music/pitch';
import { LATENCY_PRESETS, type Settings, type SettingsPatch } from '../../core/settings';
import { inputBus } from '../../input/inputBus';
import { useStore } from '../../lib/store';
import type { MidiService, MidiState } from '../../platform/midi/midiService';
import { BrowserBluetoothHelp, MidiButtons } from './MidiConnect';
import { connectedInputs, midiStatusText } from './midiStatus';
import { Select } from './controls';

export type SetupStep = 'connect' | 'level' | 'metronome';

/**
 * First-run setup: connect a real piano (the way the app is meant to be played), say how well
 * you play, line up the metronome. Shown once; reopened from Input & audio or the MIDI chip.
 * Every step can be skipped, and nothing is changed by a step that is left untouched.
 */
export function SetupGuide(props: {
  settings: Settings;
  update: (patch: SettingsPatch) => void;
  midi: MidiService;
  /** Where to open: the first step on first run, or the step that was asked for. */
  initialStep: SetupStep;
  /** Opened again by the player, who already has levels of their own. */
  reopened: boolean;
  /** The calibration dialog is on top; the guide waits underneath with its state kept. */
  hidden: boolean;
  onCalibrate: () => void;
  /** Starting levels were changed: show an exercise at the new level. */
  onLevelsChanged: () => void;
  onClose: () => void;
}) {
  const { settings: s, update, onClose, hidden } = props;
  const midi = useStore(props.midi.state);
  const [step, setStep] = useState<SetupStep>(props.initialStep);
  /** The "no piano here" screen of the first step. */
  const [explainingFallback, setExplainingFallback] = useState(false);
  /** Continued without a piano: the metronome step is left out. */
  const [noPiano, setNoPiano] = useState(false);
  const [heard, setHeard] = useState<number | null>(null);
  const [selection, setSelection] = useState<ExperienceSelection | null>(s.experience);
  const card = useRef<HTMLDivElement>(null);

  // Notes played here are for the guide alone: they must not reach the exercise underneath.
  useEffect(() => {
    if (hidden) return;
    return inputBus.capture((ev) => {
      if (ev.kind === 'noteOn' && ev.source === 'midi') setHeard(ev.midi);
    });
  }, [hidden]);

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
  }, [hidden, step, explainingFallback]);

  if (hidden) return null;

  const steps: SetupStep[] = noPiano ? ['connect', 'level'] : ['connect', 'level', 'metronome'];
  const index = steps.indexOf(step);
  const last = index === steps.length - 1;
  const connected = connectedInputs(midi);

  const leaveLevel = () => {
    if (selection && !sameSelection(selection, s.experience)) {
      update(experiencePatch(selection));
      props.onLevelsChanged();
    }
  };
  const next = () => {
    if (step === 'level') leaveLevel();
    if (last) onClose();
    else setStep(steps[index + 1]);
  };
  const back = () => setStep(steps[index - 1]);

  const title = step === 'connect' ? (explainingFallback ? 'Playing without a piano' : 'Connect your piano') : step === 'level' ? 'How well do you play?' : 'Line up the metronome';

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="setup-title">
      <div className="modal-card setup" ref={card} tabIndex={-1}>
        <div className="modal-head">
          <div>
            <div className="setup-progress">
              Setup · step {index + 1} of {steps.length}
            </div>
            <h2 id="setup-title">{title}</h2>
          </div>
          <button type="button" className="icon-btn" aria-label="Close setup" onClick={onClose}>
            ✕
          </button>
        </div>

        {step === 'connect' && !explainingFallback ? (
          <>
            <ConnectStep midi={midi} service={props.midi} heard={heard} />
            <div className="modal-actions setup-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Skip setup
              </button>
              {/* Where a piano cannot be connected at all, going on without one is the way forward. */}
              <button type="button" className={`btn ${midi.status === 'unsupported' ? 'btn-primary' : ''}`} onClick={() => setExplainingFallback(true)}>
                {midi.status === 'unsupported' ? 'Continue without a piano' : 'I don’t have a piano here'}
              </button>
              {midi.status === 'unsupported' ? null : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!connected.length}
                  onClick={() => {
                    setNoPiano(false);
                    setStep('level');
                  }}
                >
                  Next
                </button>
              )}
            </div>
          </>
        ) : null}

        {step === 'connect' && explainingFallback ? (
          <>
            <div className="setup-body">
              <p>
                You can try every lesson with the <b>keys on the screen</b> (mouse or touch) or with your <b>computer keyboard</b>: <kbd>A</kbd>–<kbd>'</kbd> are the white
                keys, <kbd>W</kbd> <kbd>E</kbd> <kbd>T</kbd> <kbd>Y</kbd> <kbd>U</kbd> the black ones. We’ll turn on <b>Key sound</b> so those keys make a sound.
              </p>
              <p>
                It is a way to look around, not to practice: fingering, both hands and playing in time need a real keyboard. When your piano is nearby, press{' '}
                <b>Connect a piano</b> in the top bar, or open <b>Input &amp; audio → Setup guide</b>.
              </p>
            </div>
            <div className="modal-actions setup-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setExplainingFallback(false)}>
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  update({ keySound: true });
                  setNoPiano(true);
                  setExplainingFallback(false);
                  setStep('level');
                }}
              >
                Continue without a piano
              </button>
            </div>
          </>
        ) : null}

        {step === 'level' ? (
          <>
            <LevelStep selection={selection} onChange={setSelection} reopened={props.reopened} />
            <div className="modal-actions setup-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Skip setup
              </button>
              <button type="button" className="btn" onClick={back}>
                Back
              </button>
              <button type="button" className="btn btn-primary" onClick={next}>
                {last ? 'Start practicing' : 'Next'}
              </button>
            </div>
          </>
        ) : null}

        {step === 'metronome' ? (
          <>
            <MetronomeStep settings={s} update={update} onCalibrate={props.onCalibrate} />
            <div className="modal-actions setup-actions">
              <button type="button" className="btn btn-ghost" onClick={back}>
                Back
              </button>
              <button type="button" className="btn btn-primary" onClick={next}>
                Start practicing
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ConnectStep(props: { midi: MidiState; service: MidiService; heard: number | null }) {
  const { midi, heard } = props;
  const connected = connectedInputs(midi);
  const names = connected.map((i) => i.name).join(', ');
  const noMidiHere = midi.status === 'unsupported';

  return (
    <div className="setup-body">
      <p>
        Practice Piano is made to be played on a <b>real piano or keyboard</b>. It listens to what you play over <b>USB or Bluetooth MIDI</b> and scores your notes and your
        timing.
      </p>

      {connected.length ? (
        <div className={`setup-listen ${heard !== null ? 'is-heard' : ''}`} aria-live="polite">
          <span className="setup-listen-mark" aria-hidden="true">
            {heard !== null ? '✓' : '♪'}
          </span>
          {heard !== null ? (
            <div>
              <b>We hear you: {midiLabel(heard)}</b>
              <span>on {midi.lastInputName ?? names}. Your piano is ready.</span>
            </div>
          ) : (
            <div>
              <b>Found {names}</b>
              <span>Play any key on it to check the connection.</span>
            </div>
          )}
        </div>
      ) : noMidiHere ? (
        <div className="setup-note is-warn">
          <b>This browser can’t connect to a piano.</b>
          <ul>
            <li>
              On a computer, open this page in <b>Chrome</b> or <b>Edge</b>.
            </li>
            <li>
              On an iPad or iPhone, use the <b>Practice Piano app</b>: browsers there cannot use MIDI.
            </li>
          </ul>
        </div>
      ) : midi.status === 'ready' ? (
        <>
          <p className="status-line">No piano found yet.</p>
          <ul className="setup-ways">
            <li>
              <b>USB</b>
              <span>Connect the piano’s USB port (“USB to Host”) to this device and switch the piano on. It shows up here by itself.</span>
            </li>
            <li>
              <b>Bluetooth</b>
              <span>
                {midi.canPairBluetooth ? 'Press Pair Bluetooth MIDI and choose your piano from the list.' : <BrowserBluetoothHelp />}
              </span>
            </li>
          </ul>
          <div className="button-row">
            <MidiButtons midi={props.service} canPairBluetooth={midi.canPairBluetooth} />
          </div>
        </>
      ) : (
        <>
          <p className={`status-line ${midi.status === 'initializing' ? '' : 'is-warn'}`}>{midiStatusText(midi)}</p>
          {midi.status === 'initializing' ? (
            <p className="field-hint">If your browser asks whether this site may use MIDI devices, choose Allow.</p>
          ) : (
            <div className="button-row">
              <MidiButtons midi={props.service} canPairBluetooth={midi.canPairBluetooth} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LevelStep(props: { selection: ExperienceSelection | null; onChange: (s: ExperienceSelection) => void; reopened: boolean }) {
  const { selection } = props;
  const stage = stageOf(selection);
  return (
    <div className="setup-body">
      <p>Pick what fits best. It sets a starting point for every lesson, and you can change any level later.</p>
      <div className="setup-stages" role="radiogroup" aria-label="How well do you play?">
        {STAGES.map((st) => (
          <button
            key={st.id}
            type="button"
            role="radio"
            aria-checked={stage?.id === st.id}
            className={`setup-stage ${stage?.id === st.id ? 'is-active' : ''}`}
            onClick={() => props.onChange(st.selection)}
          >
            <b>{st.name}</b>
            <span>{st.description}</span>
          </button>
        ))}
      </div>

      {selection ? (
        <div className="setup-skills">
          <p className="setup-skills-head">
            <b>We’ll start you here.</b> Change anything that doesn’t fit.
          </p>
          {EXPERIENCE_SKILLS.map((skill) => (
            <Select<number>
              key={skill}
              label={SKILLS[skill].name}
              value={selection[skill]}
              onChange={(i) => props.onChange({ ...selection, [skill]: i })}
              options={SKILLS[skill].statements.map((st, i) => ({ value: i, label: st.text }))}
            />
          ))}
          {props.reopened ? <p className="field-hint">A change here replaces the level and options you have now in the lessons it covers.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function MetronomeStep(props: { settings: Settings; update: (patch: SettingsPatch) => void; onCalibrate: () => void }) {
  const { settings: s } = props;
  const calibrated = s.audioSetup === 'calibrated' && s.calibration;
  return (
    <div className="setup-body">
      <p>
        In <b>Flow</b> mode you play in time with a metronome. Sound takes a moment to travel — longer over Bluetooth — so the app needs to know how late the click reaches
        your ears to judge your timing fairly.
      </p>
      {calibrated ? (
        <p className="status-line is-ok">
          Calibrated · {s.calibration!.latencyMs} ms ± {s.calibration!.spreadMs} ms
        </p>
      ) : null}
      <button type="button" className={`btn btn-block ${calibrated ? '' : 'btn-primary'}`} onClick={props.onCalibrate}>
        {calibrated ? 'Calibrate again…' : 'Calibrate now (about 30 seconds)…'}
      </button>
      <p className="field-hint">You play a key along with a few clicks, and the app measures your exact setup. This is the most accurate option.</p>

      <div className="field">
        <div className="field-label">Or pick the closest setup</div>
        <div className="setup-presets">
          {(['speakers', 'headphones'] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={s.audioSetup === id}
              className={`setup-stage ${s.audioSetup === id ? 'is-active' : ''}`}
              onClick={() => props.update({ audioSetup: id, latencyMs: LATENCY_PRESETS[id].latencyMs, playheadDelayMs: LATENCY_PRESETS[id].playheadDelayMs })}
            >
              <b>
                {LATENCY_PRESETS[id].label} · {LATENCY_PRESETS[id].latencyMs} ms
              </b>
              <span>{LATENCY_PRESETS[id].help}</span>
            </button>
          ))}
        </div>
      </div>
      <p className="field-hint">
        This only matters in Flow mode. You can do it later under <b>Input &amp; audio</b>.
      </p>
    </div>
  );
}
