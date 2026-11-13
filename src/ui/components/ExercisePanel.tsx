import { useState } from 'react';
import type { HandsMode } from '../../core/exercise';
import { bpmForLevel, RHYTHM_COMPLEXITY_LABELS } from '../../core/generator/difficulty';
import { tierForLevel } from '../../core/generator/tiers';
import { KEYS } from '../../core/music/keys';
import { TIME_SIGNATURE_IDS, type TimeSignatureId } from '../../core/music/rhythm';
import type { ProgressState } from '../../core/progress/progress';
import type { Settings, SettingsPatch } from '../../core/settings';
import { CommitSlider, Field, Segmented, Select, Toggle } from './controls';

export function ExercisePanel(props: {
  settings: Settings;
  progress: ProgressState;
  update: (patch: SettingsPatch) => void;
  onNew: () => void;
  weakNotesLabel: string | null;
}) {
  const { settings: s, update } = props;
  const [preview, setPreview] = useState<number | null>(null);
  const shownLevel = preview ?? s.sight.level;
  const tier = tierForLevel(shownLevel);
  const tierState = props.progress.tiers[tier.id];
  const advancedCount = [s.sight.keyId !== 'auto', s.sight.timeSignature !== 'auto', s.sight.rhythmComplexity !== 'auto', s.sight.maxPolyphony !== 'auto', s.sight.bpm !== null].filter(Boolean).length;

  return (
    <div className="panel-body">
      <section className="panel-section">
        <CommitSlider
          className="difficulty-slider"
          label="Difficulty"
          min={1}
          max={100}
          value={s.sight.level}
          onPreview={setPreview}
          onCommit={(level) => {
            setPreview(null);
            update({ sight: { level } });
          }}
          format={(v) => <span className="level-num">{v}</span>}
        />
        <div className="tier-line">
          <span className="tier-name">{tier.name}</span>
          <span className="tier-summary">{tier.summary}</span>
        </div>
        <div className="tier-progress" title="Pass distinct passages with ≥ 90% pitch accuracy to master this tier">
          <div className="progress-track">
            <div
              className={`progress-fill ${tierState?.mastered ? 'is-mastered' : ''}`}
              style={{ width: `${Math.min(100, ((tierState?.passes ?? 0) / tier.passesRequired) * 100)}%` }}
            />
          </div>
          <span className="tier-count">
            {tierState?.mastered ? 'Mastered' : `${Math.min(tierState?.passes ?? 0, tier.passesRequired)}/${tier.passesRequired}`}
          </span>
        </div>
      </section>

      <section className="panel-section">
        <Field label="Hands">
          <Segmented<HandsMode>
            label="Hands"
            value={s.sight.hands}
            onChange={(hands) => update({ sight: { hands } })}
            options={[
              { value: 'rh', label: 'RH', title: 'Right hand — treble clef' },
              { value: 'lh', label: 'LH', title: 'Left hand — bass clef' },
              { value: 'alternating', label: 'Alt', title: 'Hands take turns — grand staff' },
              { value: 'both', label: 'Both', title: 'Both hands together — grand staff' },
            ]}
          />
        </Field>
        <Field label="Length">
          <Segmented<number>
            label="Length"
            value={s.sight.bars}
            onChange={(bars) => update({ sight: { bars: bars as Settings['sight']['bars'] } })}
            options={[4, 8, 16].map((b) => ({ value: b, label: `${b} bars` }))}
          />
        </Field>
        <button type="button" className="btn btn-primary btn-block" onClick={props.onNew}>
          New exercise <kbd>N</kbd>
        </button>
      </section>

      <section className="panel-section">
        <Toggle
          label="Weak-spot practice"
          hint={props.weakNotesLabel ? `Featuring ${props.weakNotesLabel}` : 'Play a few exercises first so we can find your weak notes'}
          checked={s.weakSpotFocus}
          onChange={(weakSpotFocus) => update({ weakSpotFocus })}
        />
      </section>

      <details className="panel-section advanced" open={advancedCount > 0 || undefined}>
        <summary>
          Overrides <span className="muted">{advancedCount ? `${advancedCount} active` : 'all auto'}</span>
        </summary>
        <div className="grid-2">
          <Select
            label="Key"
            value={s.sight.keyId}
            onChange={(keyId) => update({ sight: { keyId } })}
            options={[{ value: 'auto', label: 'Auto' }, ...KEYS.map((k) => ({ value: k.id, label: k.label }))]}
          />
          <Select<'auto' | TimeSignatureId>
            label="Time"
            value={s.sight.timeSignature}
            onChange={(timeSignature) => update({ sight: { timeSignature } })}
            options={[{ value: 'auto', label: 'Auto' }, ...TIME_SIGNATURE_IDS.map((t) => ({ value: t, label: t }))]}
          />
          <Select<string>
            label="Rhythm"
            value={String(s.sight.rhythmComplexity)}
            onChange={(v) => update({ sight: { rhythmComplexity: v === 'auto' ? 'auto' : Number(v) } })}
            options={[{ value: 'auto', label: 'Auto' }, ...RHYTHM_COMPLEXITY_LABELS.map((l, i) => ({ value: String(i), label: l }))]}
          />
          <Select<string>
            label="Max notes / hand"
            value={String(s.sight.maxPolyphony)}
            onChange={(v) => update({ sight: { maxPolyphony: v === 'auto' ? 'auto' : Number(v) } })}
            options={[{ value: 'auto', label: 'Auto' }, ...[1, 2, 3, 4].map((n) => ({ value: String(n), label: n === 1 ? 'Single notes' : `Up to ${n}` }))]}
          />
        </div>
        <div className="bpm-row">
          <CommitSlider
            label="Tempo"
            min={30}
            max={200}
            value={s.sight.bpm ?? bpmForLevel(s.sight.level)}
            onCommit={(bpm) => update({ sight: { bpm } })}
            format={(v) => (s.sight.bpm === null ? `Auto · ${v} bpm` : `${v} bpm`)}
          />
          <button type="button" className="btn btn-small" disabled={s.sight.bpm === null} onClick={() => update({ sight: { bpm: null } })}>
            Auto
          </button>
        </div>
      </details>

      <section className="panel-section">
        <div className="section-title">Display</div>
        <Toggle label="Note names on the staff" hint="Letter names under the notes" checked={s.showStaffNames} onChange={(showStaffNames) => update({ showStaffNames })} />
      </section>
    </div>
  );
}
