import { useState } from 'react';
import { earProfile, type EarReference } from '../../core/ear/generator';
import { earTierForLevel } from '../../core/ear/tiers';
import { KEYS } from '../../core/music/keys';
import { INTERVAL_NAMES, type ProgressState } from '../../core/progress/progress';
import type { Settings } from '../../core/settings';
import { CommitSlider, Field, Segmented, Select, Toggle } from './controls';

const CONTENT_TEXT = { melody: 'Melodies', dyads: 'Two-note intervals', triads: 'Triads', mixed: 'Melodies with chords' } as const;

export function EarPanel(props: {
  settings: Settings;
  progress: ProgressState;
  update: (patch: Partial<Settings>) => void;
  onNew: () => void;
  weakIntervals: number[];
}) {
  const { settings: s, update } = props;
  const [preview, setPreview] = useState<number | null>(null);
  const shown = preview ?? s.earLevel;
  const tier = earTierForLevel(shown);
  const profile = earProfile(shown);
  const tierState = props.progress.tiers[tier.id];

  return (
    <div className="panel-body">
      <section className="panel-section">
        <CommitSlider
          className="difficulty-slider"
          label="Ear level"
          min={1}
          max={100}
          value={s.earLevel}
          onPreview={setPreview}
          onCommit={(earLevel) => {
            setPreview(null);
            update({ earLevel });
          }}
          format={(v) => <span className="level-num">{v}</span>}
        />
        <div className="tier-line">
          <span className="tier-name">{tier.name}</span>
          <span className="tier-summary">{tier.summary}</span>
        </div>
        <div className="tier-progress" title="Find distinct phrases with ≥ 90% accuracy (hints count as misses) to master this tier">
          <div className="progress-track">
            <div
              className={`progress-fill ${tierState?.mastered ? 'is-mastered' : ''}`}
              style={{ width: `${Math.min(100, ((tierState?.passes ?? 0) / tier.passesRequired) * 100)}%` }}
            />
          </div>
          <span className="tier-count">{tierState?.mastered ? 'Mastered' : `${Math.min(tierState?.passes ?? 0, tier.passesRequired)}/${tier.passesRequired}`}</span>
        </div>
        <p className="field-hint ear-profile">
          {CONTENT_TEXT[profile.content]} · {profile.length} {profile.content === 'melody' || profile.content === 'mixed' ? 'notes' : 'chords'} ·{' '}
          {profile.firstNoteGiven ? 'first note shown' : 'key only'}
          {profile.cadence ? ' · cadence first' : ''}
        </p>
      </section>

      <section className="panel-section">
        <p className="field-hint">
          Listen, then play the phrase back on your piano. Notes appear on the staff as you find them. <kbd>Space</kbd> or a quick sustain-pedal tap replays it;{' '}
          <kbd>?</kbd> reveals the next note.
        </p>
        <button type="button" className="btn btn-primary btn-block" onClick={props.onNew}>
          New phrase <kbd>N</kbd>
        </button>
        <Toggle
          label="Weak-spot practice"
          hint={
            props.weakIntervals.length
              ? `Featuring ${props.weakIntervals.map((i) => INTERVAL_NAMES[i]).join(', ')}`
              : 'After a few phrases, intervals you miss most are featured more often'
          }
          checked={s.weakSpotFocus}
          onChange={(weakSpotFocus) => update({ weakSpotFocus })}
        />
      </section>

      <details className="panel-section advanced" open={s.earLength !== 'auto' || s.earReference !== 'auto' || s.earKeyId !== 'auto' || undefined}>
        <summary>
          Overrides <span className="muted">{[s.earLength !== 'auto', s.earReference !== 'auto', s.earKeyId !== 'auto'].filter(Boolean).length || 'all auto'}</span>
        </summary>
        <div className="grid-2">
          <Select<string>
            label="Length"
            value={String(s.earLength)}
            onChange={(v) => update({ earLength: v === 'auto' ? 'auto' : Number(v) })}
            options={[{ value: 'auto', label: 'Auto' }, ...[2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: `${n} notes` }))]}
          />
          <Select
            label="Key"
            value={s.earKeyId}
            onChange={(earKeyId) => update({ earKeyId })}
            options={[{ value: 'auto', label: 'Auto' }, ...KEYS.map((k) => ({ value: k.id, label: k.label }))]}
          />
        </div>
        <Field label="Reference">
          <Segmented<EarReference>
            label="Reference"
            value={s.earReference}
            onChange={(earReference) => update({ earReference })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'first-note', label: 'First note', title: 'The first note is shown on the staff' },
              { value: 'key-only', label: 'Key only', title: 'A cadence sets the key; find the first note by ear' },
            ]}
          />
        </Field>
      </details>

      <section className="panel-section">
        <div className="section-title">Sound</div>
        <CommitSlider label="Piano volume" min={0} max={100} step={5} value={Math.round(s.synthVolume * 100)} onCommit={(v) => update({ synthVolume: v / 100 })} format={(v) => `${v}%`} />
        <Toggle label="Note names" hint="On found notes and on the keys" checked={s.showNoteNames} onChange={(showNoteNames) => update({ showNoteNames })} />
        <Select<'fit' | 'full'>
          label="Keyboard view"
          value={s.keyboardView}
          onChange={(keyboardView) => update({ keyboardView })}
          options={[
            { value: 'fit', label: 'Compact (C3–C6)' },
            { value: 'full', label: 'Full keyboard' },
          ]}
        />
      </section>
    </div>
  );
}
