import { type PcSpelling, pitchLabel, spellMidiIn } from '../../core/music/pitch';
import { inputBus } from '../../input/inputBus';
import { useStore } from '../../lib/store';

/** Held keys; spelled like the on-screen keyboard (flats in flat keys, chord tones as the chord spells them). */
export function InputMonitor(props: { preferFlats?: boolean; spelling?: PcSpelling }) {
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
            {pitchLabel(spellMidiIn(m, !!props.preferFlats, props.spelling), true)}
          </span>
        ))}
        {held.sustained.map((m) => (
          <span key={`s${m}`} className="note-chip is-sustained" title="Sounding via sustain pedal">
            {pitchLabel(spellMidiIn(m, !!props.preferFlats, props.spelling), true)}
          </span>
        ))}
      </div>
    </div>
  );
}
