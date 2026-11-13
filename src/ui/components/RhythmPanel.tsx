import { useCallback, useEffect, useState } from 'react';
import { figureName } from '../../core/generator/rhythm';
import { midiLabel } from '../../core/music/pitch';
import { TIME_SIGNATURE_IDS, TIME_SIGNATURES, type TimeSignatureId } from '../../core/music/rhythm';
import {
  RHYTHM_TEXTURES,
  rhythmProfile,
  TASK_INFO,
  TEXTURE_INFO,
  type RhythmHands,
  type RhythmTask,
  type RhythmTexture,
} from '../../core/rhythm/generator';
import { rhythmTierForLevel } from '../../core/rhythm/tiers';
import type { ProgressState, TimeStat } from '../../core/progress/progress';
import type { Settings } from '../../core/settings';
import { inputBus } from '../../input/inputBus';
import { CommitSlider, Field, Segmented, Select, Toggle } from './controls';

type Learning = 'rh' | 'lh' | null;

/** "Press the key you want": captures the next note-on as a designated key. */
function useKeyLearning(onLearn: (hand: 'rh' | 'lh', midi: number) => void) {
  const [learning, setLearning] = useState<Learning>(null);
  useEffect(() => {
    if (!learning) return;
    const release = inputBus.capture((ev) => {
      if (ev.kind !== 'noteOn') return;
      onLearn(learning, ev.midi);
      setLearning(null);
    });
    return release;
  }, [learning, onLearn]);
  return [learning, setLearning] as const;
}

export function RhythmPanel(props: {
  settings: Settings;
  progress: ProgressState;
  update: (patch: Partial<Settings>) => void;
  onNew: () => void;
  weakFigures: TimeStat[];
}) {
  const { settings: s, update } = props;
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? s.rhythmLevel;
  const tier = rhythmTierForLevel(shown);
  const profile = rhythmProfile(shown);
  const tierState = props.progress.tiers[tier.id];
  const { rhythmRhKey, rhythmLhKey } = s;
  const learn = useCallback(
    (hand: 'rh' | 'lh', midi: number) => {
      const other = hand === 'rh' ? rhythmLhKey : rhythmRhKey;
      if (midi === other) return; // one key per hand
      update(hand === 'rh' ? { rhythmRhKey: midi } : { rhythmLhKey: midi });
    },
    [rhythmRhKey, rhythmLhKey, update],
  );
  const [learning, setLearning] = useKeyLearning(learn);

  const meters = profile.timePool.map((t) => t.id).join(', ');
  const tempo = profile.bpm(TIME_SIGNATURES['4/4'], null);
  const overrides = [s.rhythmTimeSignature !== 'auto', s.rhythmBpm !== null].filter(Boolean).length;

  const keyRow = (hand: 'rh' | 'lh') => {
    const midi = hand === 'rh' ? s.rhythmRhKey : s.rhythmLhKey;
    const active = learning === hand;
    return (
      <div className={`key-assign ${active ? 'is-learning' : ''}`}>
        <span className="key-assign-hand">{hand === 'rh' ? 'Right hand' : 'Left hand'}</span>
        <span className="key-assign-note">{active ? 'Press a key…' : midiLabel(midi)}</span>
        <kbd title="Computer keyboard">{hand === 'rh' ? 'J' : 'F'}</kbd>
        <button type="button" className="btn btn-small" onClick={() => setLearning(active ? null : hand)}>
          {active ? 'Cancel' : 'Change'}
        </button>
      </div>
    );
  };

  return (
    <div className="panel-body">
      <section className="panel-section">
        <CommitSlider
          className="difficulty-slider"
          label="Rhythm level"
          min={1}
          max={100}
          value={s.rhythmLevel}
          onPreview={setPreview}
          onCommit={(rhythmLevel) => {
            setPreview(null);
            update({ rhythmLevel });
          }}
          format={(v) => <span className="level-num">{v}</span>}
        />
        <div className="tier-line">
          <span className="tier-name">{tier.name}</span>
          <span className="tier-summary">{tier.summary}</span>
        </div>
        <div className="tier-progress" title="Pass distinct exercises with ≥ 90% hits and ≥ 70% timing to master this tier">
          <div className="progress-track">
            <div
              className={`progress-fill ${tierState?.mastered ? 'is-mastered' : ''}`}
              style={{ width: `${Math.min(100, ((tierState?.passes ?? 0) / tier.passesRequired) * 100)}%` }}
            />
          </div>
          <span className="tier-count">{tierState?.mastered ? 'Mastered' : `${Math.min(tierState?.passes ?? 0, tier.passesRequired)}/${tier.passesRequired}`}</span>
        </div>
        <p className="field-hint ear-profile">
          {meters} · ~{tempo} bpm · Echo {profile.echoBars === 1 ? '1 bar' : '2 bars'} · Pulse {profile.pulse.on} on / {profile.pulse.off} off
        </p>
      </section>

      <section className="panel-section">
        <Field label="Task" hint={TASK_INFO[s.rhythmTask].help}>
          <Segmented<RhythmTask>
            label="Task"
            value={s.rhythmTask}
            onChange={(rhythmTask) => update({ rhythmTask })}
            options={(['read', 'echo', 'pulse'] as const).map((t) => ({ value: t, label: TASK_INFO[t].name, title: TASK_INFO[t].help }))}
          />
        </Field>
        <Field label="Hands">
          <Segmented<RhythmHands>
            label="Hands"
            value={s.rhythmHands}
            onChange={(rhythmHands) => update({ rhythmHands })}
            options={[
              { value: 'rh', label: 'Right' },
              { value: 'lh', label: 'Left' },
              { value: 'both', label: 'Both', title: 'Hand independence: each hand taps its own key' },
            ]}
          />
        </Field>
        {s.rhythmHands === 'both' ? (
          <Select<'auto' | RhythmTexture>
            label="Texture"
            value={s.rhythmTexture}
            onChange={(rhythmTexture) => update({ rhythmTexture })}
            options={[
              { value: 'auto', label: 'Auto (by level)' },
              ...RHYTHM_TEXTURES.map((t) => ({
                value: t,
                label: `${TEXTURE_INFO[t].name}${TEXTURE_INFO[t].minLevel > s.rhythmLevel ? ` · from level ${TEXTURE_INFO[t].minLevel}` : ''}`,
              })),
            ]}
          />
        ) : null}
        {s.rhythmHands === 'both' && s.rhythmTexture !== 'auto' ? <p className="field-hint">{TEXTURE_INFO[s.rhythmTexture].help}</p> : null}
        <Field label="Length">
          <Segmented<number>
            label="Length"
            value={s.rhythmBars}
            onChange={(bars) => update({ rhythmBars: bars as Settings['rhythmBars'] })}
            options={[4, 8].map((b) => ({ value: b, label: `${b} bars` }))}
          />
        </Field>
        <button type="button" className="btn btn-primary btn-block" onClick={props.onNew}>
          New rhythm <kbd>N</kbd>
        </button>
      </section>

      <section className="panel-section">
        <div className="section-title">Your keys</div>
        {s.rhythmHands !== 'lh' ? keyRow('rh') : null}
        {s.rhythmHands !== 'rh' ? keyRow('lh') : null}
        <p className="field-hint">Only these keys count, so a stray note is never held against you.</p>
      </section>

      <section className="panel-section">
        <Toggle
          label="Weak-spot practice"
          hint={
            props.weakFigures.length
              ? `Featuring ${props.weakFigures.map((f) => figureName(f.key).toLowerCase()).join(', ')}`
              : 'After a few exercises, the figures you miss or rush are featured more often'
          }
          checked={s.weakSpotFocus}
          onChange={(weakSpotFocus) => update({ weakSpotFocus })}
        />
      </section>

      <details className="panel-section advanced" open={overrides > 0 || undefined}>
        <summary>
          Overrides <span className="muted">{overrides ? `${overrides} active` : 'all auto'}</span>
        </summary>
        <Select<'auto' | TimeSignatureId>
          label="Time"
          value={s.rhythmTimeSignature}
          onChange={(rhythmTimeSignature) => update({ rhythmTimeSignature })}
          options={[{ value: 'auto', label: 'Auto' }, ...TIME_SIGNATURE_IDS.map((t) => ({ value: t, label: t }))]}
        />
        <div className="bpm-row">
          <CommitSlider
            label="Tempo"
            min={30}
            max={200}
            value={s.rhythmBpm ?? tempo}
            onCommit={(rhythmBpm) => update({ rhythmBpm })}
            format={(v) => (s.rhythmBpm === null ? `Auto · ${v} bpm` : `${v} bpm`)}
          />
          <button type="button" className="btn btn-small" disabled={s.rhythmBpm === null} onClick={() => update({ rhythmBpm: null })}>
            Auto
          </button>
        </div>
        <p className="field-hint">Polyrhythms are always written in 3/4. Tempo counts dotted quarters in 6/8.</p>
      </details>

      <section className="panel-section">
        <div className="section-title">Sound</div>
        <CommitSlider
          label="Metronome"
          min={0}
          max={100}
          step={5}
          value={Math.round(s.metronomeVolume * 100)}
          onCommit={(v) => update({ metronomeVolume: v / 100 })}
          format={(v) => `${v}%`}
        />
        <CommitSlider label="Echo voice" min={0} max={100} step={5} value={Math.round(s.synthVolume * 100)} onCommit={(v) => update({ synthVolume: v / 100 })} format={(v) => `${v}%`} />
      </section>
    </div>
  );
}
