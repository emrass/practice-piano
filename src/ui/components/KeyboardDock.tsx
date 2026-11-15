import { useMemo } from 'react';
import { PIANO_ACTIONS } from '../../core/input/pianoShortcuts';
import { midiLabel, type PcSpelling } from '../../core/music/pitch';
import type { Settings, SettingsPatch } from '../../core/settings';
import { useStore } from '../../lib/store';
import { inputBus } from '../../input/inputBus';
import type { KeyboardAvailability } from '../lessons/types';
import type { PracticeState, Session } from '../practice/session';
import { InputMonitor } from './InputAudioPanel';
import { KeyboardControls } from './KeyboardControls';
import { PianoKeyboard } from './PianoKeyboard';

/** The on-screen keyboard with the bar above it: held notes, range, display settings and key sound. */
export function KeyboardDock(props: {
  controller: Session;
  min: number;
  max: number;
  settings: Settings;
  preferFlats: boolean;
  qwertyBase: number | null;
  /** Rhythm mode: the designated keys. */
  markers?: ReadonlyMap<number, string>;
  /** Spelling that follows the run (chords: the chord asked for). */
  spelling?: (state: PracticeState) => PcSpelling | undefined;
  update: (patch: SettingsPatch) => void;
  availability: KeyboardAvailability;
  /** The lesson has something to move on to (piano D is on offer after a run). */
  hasNext: boolean;
}) {
  const held = useStore(inputBus.held);
  const soundOn = props.settings.keySound;
  const state = useStore(props.controller.state);
  const guideOn = props.settings.showKeyboardGuide && !props.availability.unavailable?.guide;
  const expected = useMemo(
    () => (state.status === 'finished' ? [] : [...new Set([...(guideOn ? state.expected : []), ...state.revealed])]),
    [state.status, state.expected, state.revealed, guideOn],
  );
  // The keys carry one short word each (the results card spells out the lesson's own labels).
  const actionLabels = useMemo(() => new Map(PIANO_ACTIONS.filter((a) => props.hasNext || a.action !== 'next').map((a) => [a.pc, a.label])), [props.hasNext]);
  const actions = props.settings.pianoShortcuts && state.status === 'finished' ? actionLabels : undefined;
  const spelling = props.spelling?.(state);
  return (
    <div className="keyboard-dock">
      <div className="keyboard-head">
        <InputMonitor preferFlats={props.preferFlats} spelling={spelling} />
        <div className="kb-right">
          <span className="muted kb-range">
            {midiLabel(props.min)}–{midiLabel(props.max)}
          </span>
          <KeyboardControls settings={props.settings} update={props.update} availability={props.availability} />
          <button
            type="button"
            className={`kb-icon kb-sound ${soundOn ? 'is-on' : ''}`}
            aria-pressed={soundOn}
            aria-label="Key sound for on-screen and computer keys"
            title={soundOn ? 'Key sound on — on-screen and computer keys play a piano sound' : 'Key sound off — turn on to hear on-screen and computer keys'}
            onClick={() => props.update({ keySound: !soundOn })}
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
              <path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" fill="currentColor" />
              {soundOn ? (
                <path d="M13 7a4 4 0 0 1 0 6M15.5 4.8a7 7 0 0 1 0 10.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              ) : (
                <path d="M13.2 7.6l4.4 4.8M17.6 7.6l-4.4 4.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>
      <PianoKeyboard
        min={props.min}
        max={props.max}
        held={held.held}
        sustained={held.sustained}
        expected={expected}
        wrong={state.wrong?.midi ?? null}
        showLabels={props.settings.showKeyNames}
        preferFlats={props.preferFlats}
        spelling={spelling}
        qwertyBase={props.qwertyBase}
        actions={actions}
        markers={state.status === 'finished' ? undefined : props.markers}
      />
    </div>
  );
}
