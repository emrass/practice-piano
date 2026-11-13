import { HANDS_LABEL, NOTE_VALUE_LABEL, SCALE_TYPE_IDS, SCALE_TYPES, tonicLabel, type NoteValue, type ScaleHands, type ScaleTypeId } from '../../core/scales/catalog';
import { nps, tempoText, type ScaleExercise } from '../../core/scales/generator';
import type { ProgressState } from '../../core/progress/progress';
import type { Settings } from '../../core/settings';
import { CommitSlider, Field, Segmented, Select, Toggle } from './controls';

const DAY = 24 * 60 * 60 * 1000;

function dueText(dueAt: number, now: number): string {
  const days = Math.ceil((dueAt - now) / DAY);
  if (days <= 0) return 'due now';
  return days === 1 ? 'review tomorrow' : `review in ${days} days`;
}

export function ScalesPanel(props: {
  settings: Settings;
  progress: ProgressState;
  update: (patch: Partial<Settings>) => void;
  onNew: () => void;
  exercise: ScaleExercise;
  onTempo: (deltaBpm: number) => void;
  dueCount: number;
  now: number;
}) {
  const { settings: s, update, exercise: ex } = props;
  const def = SCALE_TYPES[s.scaleType];
  const kind = def.kind;
  const item = props.progress.repertoire[ex.scale.itemId];
  const goalNpm = s.scaleGoalNps * 60;
  const now = props.now;
  const types = SCALE_TYPE_IDS.filter((t) => SCALE_TYPES[t].kind === kind);
  const review = s.scaleSource === 'review';

  return (
    <div className="panel-body">
      <section className="panel-section">
        <Field label="Practise">
          <Segmented<'scale' | 'arpeggio'>
            label="Kind"
            value={kind}
            onChange={(k) => {
              const type = SCALE_TYPE_IDS.find((t) => SCALE_TYPES[t].kind === k)!;
              update({ scaleType: type, scaleSource: 'pick' });
            }}
            options={[
              { value: 'scale', label: 'Scales' },
              { value: 'arpeggio', label: 'Arpeggios' },
            ]}
          />
        </Field>
        <div className="grid-2">
          <Select<ScaleTypeId>
            label="Type"
            value={s.scaleType}
            onChange={(scaleType) => update({ scaleType, scaleSource: 'pick' })}
            options={types.map((t) => ({ value: t, label: SCALE_TYPES[t].name }))}
          />
          <Select<string>
            label="Key"
            value={s.scaleTonic}
            onChange={(scaleTonic) => update({ scaleTonic, scaleSource: 'pick' })}
            options={[
              { value: 'shuffle', label: 'Shuffle keys' },
              ...def.tonics.map((t) => ({ value: t, label: `${tonicLabel(t)}${def.keyMode === 'minor' ? ' minor' : def.keyMode === 'major' ? ' major' : ''}` })),
            ]}
          />
        </div>
        <Field label="Hands">
          <Segmented<ScaleHands>
            label="Hands"
            value={s.scaleHands}
            onChange={(scaleHands) => update({ scaleHands })}
            options={[
              { value: 'rh', label: 'RH' },
              { value: 'lh', label: 'LH' },
              { value: 'together', label: 'Together', title: HANDS_LABEL.together },
              ...(def.contrary ? [{ value: 'contrary' as const, label: 'Contrary', title: 'Contrary motion — both hands start on the same note' }] : []),
            ]}
          />
        </Field>
        <div className="grid-2">
          <Field label="Range">
            <Segmented<number>
              label="Octaves"
              value={s.scaleOctaves}
              onChange={(o) => update({ scaleOctaves: o as Settings['scaleOctaves'] })}
              options={[
                { value: 1, label: '1 oct' },
                { value: 2, label: '2 oct' },
              ]}
            />
          </Field>
          <Select<NoteValue>
            label="Rhythm"
            value={s.scaleNoteValue}
            onChange={(scaleNoteValue) => update({ scaleNoteValue })}
            options={(['quarter', 'eighth', 'sixteenth'] as const).map((v) => ({ value: v, label: NOTE_VALUE_LABEL[v] }))}
          />
        </div>
        <button type="button" className="btn btn-primary btn-block" onClick={props.onNew}>
          {review ? 'Next due item' : s.scaleTonic === 'shuffle' ? 'Next key' : 'Again'} <kbd>N</kbd>
        </button>
      </section>

      <section className="panel-section">
        <div className="section-title">Tempo ladder</div>
        <div className="item-status">
          <div className="item-status-title">{ex.scale.title}</div>
          <div className="item-status-sub">
            {HANDS_LABEL[ex.scale.item.hands]} · {ex.scale.octaves} octave{ex.scale.octaves > 1 ? 's' : ''}
            {item?.mastered ? <span className="badge badge-mastered">★ Mastered</span> : null}
          </div>
          <div className="ladder-row">
            <button type="button" className="btn btn-small" onClick={() => props.onTempo(-4)} aria-label="Slower">
              −
            </button>
            <span className="ladder-tempo">{tempoText(ex.scale.item, ex.scale.noteValue, ex.scale.npm)}</span>
            <button type="button" className="btn btn-small" onClick={() => props.onTempo(4)} aria-label="Faster">
              +
            </button>
          </div>
          <div className="progress-track" title={`${nps(ex.scale.npm)} of your ${nps(goalNpm)} goal`}>
            <div className={`progress-fill ${item?.mastered ? 'is-mastered' : ''}`} style={{ width: `${Math.min(100, (ex.scale.npm / goalNpm) * 100)}%` }} />
          </div>
          <p className="field-hint">
            {nps(ex.scale.npm)} · goal {nps(goalNpm)}
            {item ? ` · best clean ${item.bestCleanNpm ? nps(item.bestCleanNpm) : '—'} · ${item.cleanRuns} clean run${item.cleanRuns === 1 ? '' : 's'} · ${dueText(item.dueAt, now)}` : ' · new item'}
          </p>
        </div>
        <p className="field-hint">
          In <b>Flow</b>, a clean run (≥ 95 % notes, ≥ 80 % timing) adds 4 bpm; a messy one (&lt; 90 %) takes 4 off. <b>Wait</b> is for learning the notes and
          fingering at your own pace.
        </p>
      </section>

      <section className="panel-section">
        <Toggle
          label="Review due items"
          hint={
            props.dueCount
              ? `${props.dueCount} item${props.dueCount === 1 ? '' : 's'} due — weak and long-unplayed items come back first`
              : review
                ? 'Nothing due right now — you are playing your current pick'
                : 'Items you have played come back for review on a spaced schedule'
          }
          checked={review}
          onChange={(on) => update({ scaleSource: on ? 'review' : 'pick' })}
        />
      </section>

      <section className="panel-section">
        <div className="section-title">Display</div>
        <Toggle label="Fingering" hint="Standard fingering above / below the notes" checked={s.showFingering} onChange={(showFingering) => update({ showFingering })} />
        <Toggle
          label="Play from memory"
          hint="Hide the notation — just the name of the scale"
          checked={!s.scaleNotation}
          onChange={(memory) => update({ scaleNotation: !memory })}
        />
        <Toggle label="Keyboard guide" hint="Highlight the next keys" checked={s.showKeyboardGuide} onChange={(showKeyboardGuide) => update({ showKeyboardGuide })} />
        <Select<number>
          label="Mastery goal"
          value={s.scaleGoalNps}
          onChange={(scaleGoalNps) => update({ scaleGoalNps })}
          options={[2, 3, 4, 5, 6, 8].map((n) => ({ value: n, label: `${n} notes per second${n === 4 ? ' (♩ = 120 in eighths)' : ''}` }))}
        />
        <CommitSlider
          label="Metronome"
          min={0}
          max={100}
          step={5}
          value={Math.round(s.metronomeVolume * 100)}
          onCommit={(v) => update({ metronomeVolume: v / 100 })}
          format={(v) => `${v}%`}
        />
      </section>
    </div>
  );
}
