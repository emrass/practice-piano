import {
  CHORD_SET_IDS,
  CHORD_SETS,
  chordSetExamples,
  type ChordHands,
  type ChordPrompt,
  type ChordSetId,
  findProgression,
  type InversionRule,
  keysFor,
  PROGRESSIONS,
} from '../../core/chords/catalog';
import { weakChordLabel } from '../../core/chords/analysis';
import type { ChordExercise } from '../../core/chords/generator';
import type { ProgressState, WeakChordStat } from '../../core/progress/progress';
import { progressionChoice, type Settings } from '../../core/settings';
import { tonicLabel } from '../../core/scales/catalog';
import { CommitSlider, Field, Segmented, Select, Toggle } from './controls';

const DAY = 24 * 60 * 60 * 1000;

function dueText(dueAt: number, now: number): string {
  const days = Math.ceil((dueAt - now) / DAY);
  if (days <= 0) return 'due now';
  return days === 1 ? 'review tomorrow' : `review in ${days} days`;
}

export function ChordsPanel(props: {
  settings: Settings;
  progress: ProgressState;
  update: (patch: Partial<Settings>) => void;
  onNew: () => void;
  exercise: ChordExercise;
  onTempo: (deltaBpm: number) => void;
  dueCount: number;
  now: number;
  weak: WeakChordStat[];
}) {
  const { settings: s, update, exercise: ex, now } = props;
  const item = props.progress.repertoire[ex.chords.itemId];
  const review = s.chordsSource === 'review';
  const drill = s.chordsTask === 'drill';
  const def = findProgression(s.chordsProgression) ?? PROGRESSIONS[0];
  const goal = s.chordsGoalBpm;
  const bpm = ex.chords.bpm;
  const nextLabel = review ? 'Next due item' : drill ? 'New chords' : s.chordsKey === 'shuffle' ? 'Next key' : 'Again';

  return (
    <div className="panel-body">
      <section className="panel-section">
        <Field label="Practise">
          <Segmented<'drill' | 'progression'>
            label="Task"
            value={s.chordsTask}
            onChange={(chordsTask) => update({ chordsTask, chordsSource: 'pick' })}
            options={[
              { value: 'drill', label: 'Chord drill', title: 'Find chords from a set, in shuffled order' },
              { value: 'progression', label: 'Progressions', title: 'Standard progressions in every key, with smooth voice leading' },
            ]}
          />
        </Field>
        {drill ? (
          <>
            <Select<ChordSetId>
              label="Chords"
              value={s.chordsSet}
              onChange={(chordsSet) => update({ chordsSet, chordsSource: 'pick' })}
              options={CHORD_SET_IDS.map((id) => ({ value: id, label: `${CHORD_SETS[id].name} (${chordSetExamples(id)})` }))}
            />
            <div className="grid-2">
              <Field label="Shown as">
                <Segmented<ChordPrompt>
                  label="Shown as"
                  value={s.chordsPrompt}
                  onChange={(chordsPrompt) => update({ chordsPrompt, chordsSource: 'pick' })}
                  options={[
                    { value: 'symbol', label: 'Symbol', title: 'Read the chord name (Cm7) and find it' },
                    { value: 'notation', label: 'Notes', title: 'Read the chord on the staff and play it' },
                  ]}
                />
              </Field>
              <Select<number>
                label="Length"
                value={s.chordsCount}
                onChange={(n) => update({ chordsCount: n as Settings['chordsCount'] })}
                options={[8, 12, 16].map((n) => ({ value: n, label: `${n} chords` }))}
              />
            </div>
            <Select<InversionRule>
              label="Voicing"
              value={s.chordsInversions}
              onChange={(chordsInversions) => update({ chordsInversions, chordsSource: 'pick' })}
              options={[
                { value: 'root', label: 'Root position — root in the bass' },
                { value: 'inversions', label: 'Inversions — the bass note asked for' },
                { value: 'any', label: 'Any voicing — just the right notes' },
              ]}
            />
          </>
        ) : (
          <>
            <Select<string>
              label="Progression"
              value={def.id}
              onChange={(id) => update({ ...progressionChoice(id, s.chordsKey), chordsSource: 'pick' })}
              options={PROGRESSIONS.map((p) => ({ value: p.id, label: p.name }))}
            />
            <div className="grid-2">
              <Select<string>
                label="Key"
                value={s.chordsKey}
                onChange={(chordsKey) => update({ chordsKey, chordsSource: 'pick' })}
                options={[
                  { value: 'shuffle', label: 'Shuffle keys' },
                  ...keysFor(def.mode).map((k) => ({ value: k, label: `${tonicLabel(k)} ${def.mode}` })),
                ]}
              />
              <Field label="Hands">
                <Segmented<ChordHands>
                  label="Hands"
                  value={s.chordsHands}
                  onChange={(chordsHands) => update({ chordsHands, chordsSource: 'pick' })}
                  options={[
                    { value: 'rh', label: 'RH', title: 'Right hand plays the chords' },
                    { value: 'lh-bass', label: '+ LH root', title: 'Left hand plays the root, right hand the chord' },
                  ]}
                />
              </Field>
            </div>
          </>
        )}
        <button type="button" className="btn btn-primary btn-block" onClick={props.onNew}>
          {nextLabel} <kbd>N</kbd>
        </button>
      </section>

      <section className="panel-section">
        <div className="section-title">Tempo ladder</div>
        <div className="item-status">
          <div className="item-status-title">{ex.chords.title}</div>
          <div className="item-status-sub">
            One chord per bar
            {item?.mastered ? <span className="badge badge-mastered">★ Mastered</span> : null}
          </div>
          <div className="ladder-row">
            <button type="button" className="btn btn-small" onClick={() => props.onTempo(-4)} aria-label="Slower">
              −
            </button>
            <span className="ladder-tempo">♩ = {bpm}</span>
            <button type="button" className="btn btn-small" onClick={() => props.onTempo(4)} aria-label="Faster">
              +
            </button>
          </div>
          <div className="progress-track" title={`${bpm} of your ${goal} bpm goal`}>
            <div className={`progress-fill ${item?.mastered ? 'is-mastered' : ''}`} style={{ width: `${Math.min(100, (bpm / goal) * 100)}%` }} />
          </div>
          <p className="field-hint">
            {bpm} bpm · goal {goal}
            {item ? ` · best clean ${item.bestCleanTempo || '—'} · ${item.cleanRuns} clean run${item.cleanRuns === 1 ? '' : 's'} · ${dueText(item.dueAt, now)}` : ' · new item'}
          </p>
        </div>
        <p className="field-hint">
          In <b>Flow</b>, play each chord on the downbeat. A clean run (≥ 90 % chords, ≥ 75 % timing) adds 4 bpm; a messy one takes 4 off. <b>Wait</b> times how
          quickly you find each chord.
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
                : 'Drills and progressions you have played come back on a spaced schedule'
          }
          checked={review}
          onChange={(on) => update({ chordsSource: on ? 'review' : 'pick' })}
        />
        {drill ? (
          <Toggle
            label="Weak-spot focus"
            hint={props.weak.length ? `More of: ${props.weak.slice(0, 3).map(weakChordLabel).join(', ')}` : 'Draws more of the chords you miss or find slowly, once there is data'}
            checked={s.weakSpotFocus}
            onChange={(weakSpotFocus) => update({ weakSpotFocus })}
          />
        ) : null}
      </section>

      <section className="panel-section">
        <div className="section-title">Display</div>
        {drill ? null : (
          <Toggle
            label="Play from the chord chart"
            hint="Hide the notation — chord symbols and numerals only, voice it yourself"
            checked={!s.chordsNotation}
            onChange={(chart) => update({ chordsNotation: !chart })}
          />
        )}
        <Toggle label="Keyboard guide" hint="Show a suggested voicing when you are stuck (after 5 s or a wrong key)" checked={s.showKeyboardGuide} onChange={(showKeyboardGuide) => update({ showKeyboardGuide })} />
        <Select<number>
          label="Mastery goal"
          value={goal}
          onChange={(chordsGoalBpm) => update({ chordsGoalBpm })}
          options={[60, 72, 80, 96, 112, 120].map((n) => ({ value: n, label: `♩ = ${n} (a chord every ${(240 / n).toFixed(1)} s)` }))}
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
