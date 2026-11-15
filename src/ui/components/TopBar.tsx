import type { LessonId } from '../../core/lessons';
import { LESSONS } from '../../core/lessons';
import { dayKey, displayStreak, type ProgressState } from '../../core/progress/progress';
import type { Settings, SettingsPatch } from '../../core/settings';
import type { MidiState } from '../../platform/midi/midiService';
import type { LessonRuntime } from '../lessons';
import { Segmented } from './controls';

/** The MIDI chip's text: the device played from, or why there is none. */
function midiLabelText(midi: MidiState): string {
  const connectedInputs = midi.inputs.filter((i) => i.connected);
  return midi.status === 'ready' && connectedInputs.length
    ? midi.selectedId === 'auto'
      ? connectedInputs.length === 1
        ? connectedInputs[0].name
        : `${connectedInputs.length} MIDI inputs`
      : (midi.inputs.find((i) => i.id === midi.selectedId)?.name ?? 'Device offline')
    : 'Connect a piano';
}

/** Brand, lesson and Wait / Flow switches, streak, XP and MIDI chips, theme and drawer toggles. */
export function TopBar(props: {
  settings: Settings;
  update: (patch: SettingsPatch) => void;
  onLessonChange: (lesson: LessonId) => void;
  /** The Wait / Flow switch, for lessons that have both. */
  mode: LessonRuntime['mode'];
  progress: ProgressState;
  midi: MidiState;
  onOpenMidi: () => void;
  onToggleDrawer: () => void;
}) {
  const { settings: s, mode } = props;
  const streak = displayStreak(props.progress.streak, dayKey(new Date()));
  const midiConnected = props.midi.inputs.some((i) => i.connected);
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">
          practice-piano<span className="brand-tld">.com</span>
        </span>
      </div>
      <div className="topbar-lesson">
        <Segmented<LessonId>
          label="Lesson"
          value={s.lesson}
          onChange={props.onLessonChange}
          options={(Object.keys(LESSONS) as LessonId[]).map((id) => ({
            value: id,
            label: (
              <>
                <span className="label-long">{LESSONS[id].name}</span>
                <span className="label-short">{LESSONS[id].short}</span>
              </>
            ),
          }))}
        />
      </div>
      <div className={`topbar-mode ${mode ? '' : 'is-hidden'}`} aria-hidden={!mode}>
        <Segmented<'wait' | 'flow'>
          label="Practice mode"
          value={mode?.value ?? 'wait'}
          onChange={(next) => mode?.set(next)}
          options={[
            { value: 'wait', label: 'Wait', title: 'Self-paced: the cursor waits for the right notes' },
            { value: 'flow', label: 'Flow', title: 'Play in time with the metronome' },
          ]}
        />
      </div>
      <div className="topbar-right">
        <span className="chip chip-streak" title="Daily practice streak">
          <span className="chip-icon">◆</span>
          {streak} day{streak === 1 ? '' : 's'}
        </span>
        <span className="chip chip-xp" title="Experience points">
          {props.progress.xp.toLocaleString()} XP
        </span>
        <button type="button" className={`chip chip-midi ${midiConnected ? 'is-on' : ''}`} onClick={props.onOpenMidi} title="MIDI input">
          <span className="dot" aria-hidden="true" />
          <span className="chip-midi-name">{midiLabelText(props.midi)}</span>
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => props.update({ theme: s.theme === 'dark' ? 'light' : 'dark' })}
          aria-label={s.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          title="Toggle light / dark"
        >
          {s.theme === 'dark' ? '☀' : '☾'}
        </button>
        <button type="button" className="icon-btn drawer-toggle" onClick={props.onToggleDrawer} aria-label="Settings">
          ☰
        </button>
      </div>
    </header>
  );
}
