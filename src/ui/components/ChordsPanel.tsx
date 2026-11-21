import {
  CHORD_SET_IDS,
  CHORD_SETS,
  chordSetExamples,
  type ChordHands,
  type ChordPrompt,
  type ChordSetId,
  type DrillHands,
  drillHandsOf,
  findProgression,
  type InversionRule,
  inversionsOf,
  keysFor,
  progressionHandsOf,
  PROGRESSIONS,
} from '../../core/chords/catalog';
import { weakChordLabel } from '../../core/chords/analysis';
import type { ChordExercise } from '../../core/chords/generator';
import type { WeakChordStat } from '../../core/progress/chords';
import type { ProgressState } from '../../core/progress/progress';
import { progressionChoice, type Settings, type SettingsPatch } from '../../core/settings';
import { tonicLabel } from '../../core/scales/catalog';
import { CommitSlider, Field, ProgressBar, ReviewNote, Segmented, type SegmentedOption, Select, Toggle } from './controls';
import { Icon } from './Icon';

const DAY = 24 * 60 * 60 * 1000;

/** How the chords are shown, in drills and progressions alike: symbols to find the notes for, or the notes themselves. */
const SHOWN_AS: SegmentedOption<ChordPrompt>[] = [
  { value: 'symbol', label: 'Symbols', title: 'Read the chord symbols and find the notes yourself.' },
  { value: 'notation', label: 'Notes', title: 'Read the chords on the staff and play them as written.' },
];

/** The hands a chord can be written for. One name per layout, whatever the task. */
const HANDS: SegmentedOption<DrillHands>[] = [
  { value: 'rh', label: 'RH', title: 'Right hand: the chord on the treble staff' },
  { value: 'lh', label: 'LH', title: 'Left hand: the chord on the bass staff' },
  { value: 'lh-bass', label: 'RH + LH bass', title: 'Left hand plays the bass note, right hand the chord' },
  { value: 'both', label: 'Both', title: 'Hands together: both hands play the chord, an octave apart' },
];

/** Progressions are voiced for the right hand, alone or over the root in the left. */
const PROGRESSION_HANDS: readonly DrillHands[] = ['rh', 'lh-bass'] satisfies readonly ChordHands[];

function dueText(dueAt: number, now: number): string {
  const days = Math.ceil((dueAt - now) / DAY);
  if (days <= 0) return 'due now';
  return days === 1 ? 'review tomorrow' : `review in ${days} days`;
}

export function ChordsPanel(props: {
  settings: Settings;
  progress: ProgressState;
  update: (patch: SettingsPatch) => void;
  exercise: ChordExercise;
  onTempo: (deltaBpm: number) => void;
  dueCount: number;
  now: number;
  weak: WeakChordStat[];
  /** A due item from the review queue is on screen (the settings show that item). */
  reviewing: boolean;
}) {
  const { settings: s, update, exercise: ex, now } = props;
  const item = props.progress.repertoire[ex.chords.itemId];
  const review = s.chords.source === 'review';
  const drill = s.chords.task === 'drill';
  /** The chords are written on the staff, not named by symbol. */
  const notes = drill ? s.chords.prompt === 'notation' : s.chords.notation;
  const def = findProgression(s.chords.progression) ?? PROGRESSIONS[0];
  const goal = s.chords.goalBpm;
  const bpm = ex.chords.bpm;

  return (
    <div className="panel-body">
      <section className="section">
        <Field label="Practice">
          <Segmented<'drill' | 'progression'>
            label="Task"
            value={s.chords.task}
            onChange={(chordsTask) => update({ chords: { task: chordsTask, source: 'pick' } })}
            options={[
              { value: 'drill', label: 'Chord drill', title: 'Find chords from a set, in shuffled order' },
              { value: 'progression', label: 'Progressions', title: 'Standard progressions in every key, with smooth voice leading' },
            ]}
          />
        </Field>
        {/* The same two rows in drills and progressions, so they stay put when the task changes. */}
        <Field label="Shown as">
          <Segmented<ChordPrompt>
            label="Shown as"
            value={notes ? 'notation' : 'symbol'}
            onChange={(shown) => update({ chords: drill ? { prompt: shown, source: 'pick' } : { notation: shown === 'notation', source: 'pick' } })}
            options={SHOWN_AS}
          />
        </Field>
        {/* Only the staff says which hand plays what. Under symbols the choice stays in place, disabled, and the hint says why. */}
        <Field label="Hands" hint={notes ? 'What each hand plays is written on the staff.' : 'Off for symbols: any hand plays the chord.'}>
          <Segmented<DrillHands>
            label="Hands"
            value={drill ? drillHandsOf(s.chords.prompt, s.chords.drillHands) : progressionHandsOf(s.chords.notation, s.chords.hands)}
            disabled={!notes}
            onChange={(chordsHands) => update({ chords: drill ? { drillHands: chordsHands, source: 'pick' } : { hands: chordsHands as ChordHands, source: 'pick' } })}
            options={drill ? HANDS : HANDS.filter((o) => PROGRESSION_HANDS.includes(o.value))}
          />
        </Field>
        {drill ? (
          <>
            <Select<ChordSetId>
              label="Chords"
              value={s.chords.set}
              onChange={(chordsSet) => update({ chords: { set: chordsSet, source: 'pick' } })}
              options={CHORD_SET_IDS.map((id) => ({ value: id, label: `${CHORD_SETS[id].name} (${chordSetExamples(id)})` }))}
            />
            <div className="grid-2">
              {/* Notes show one voicing, so "any voicing" is for symbols only. */}
              <Select<InversionRule>
                label="Voicing"
                value={inversionsOf(s.chords.prompt, s.chords.inversions)}
                onChange={(chordsInversions) => update({ chords: { inversions: chordsInversions, source: 'pick' } })}
                options={[
                  { value: 'root', label: 'Root position' },
                  { value: 'inversions', label: 'Inversions' },
                  ...(s.chords.prompt === 'symbol' ? [{ value: 'any' as const, label: 'Any voicing' }] : []),
                ]}
              />
              <Select<number>
                label="Length"
                value={s.chords.count}
                onChange={(n) => update({ chords: { count: n as Settings['chords']['count'] } })}
                options={[8, 12, 16].map((n) => ({ value: n, label: `${n} chords` }))}
              />
            </div>
          </>
        ) : (
          <>
            <Select<string>
              label="Progression"
              value={def.id}
              onChange={(id) => update({ chords: { ...progressionChoice(id, s.chords.key), source: 'pick' } })}
              options={PROGRESSIONS.map((p) => ({ value: p.id, label: p.name }))}
            />
            <Select<string>
              label="Key"
              value={s.chords.key}
              onChange={(chordsKey) => update({ chords: { key: chordsKey, source: 'pick' } })}
              options={[{ value: 'shuffle', label: 'Shuffle keys' }, ...keysFor(def.mode).map((k) => ({ value: k, label: `${tonicLabel(k)} ${def.mode}` }))]}
            />
          </>
        )}
        {props.reviewing ? <ReviewNote mode={s.chords.mode} /> : null}
      </section>

      <section className="section">
        <div className="section-title">Tempo ladder</div>
        <div className="well item-status">
          <div className="item-status-title">{ex.chords.title}</div>
          <div className="item-status-sub">
            One chord per bar
            {item?.mastered ? (
              <span className="badge badge-mastered">
                <Icon name="star" />
                Mastered
              </span>
            ) : null}
          </div>
          <div className="ladder-row">
            <button type="button" className="btn btn-sm" onClick={() => props.onTempo(-4)} aria-label="Slower">
              −
            </button>
            <span className="ladder-tempo">♩ = {bpm}</span>
            <button type="button" className="btn btn-sm" onClick={() => props.onTempo(4)} aria-label="Faster">
              +
            </button>
          </div>
          <div title={`${bpm} of your ${goal} bpm goal`}>
            <ProgressBar label="Tempo ladder" value={bpm} max={goal} complete={!!item?.mastered} />
          </div>
          <p className="field-hint">
            {bpm} bpm · goal {goal} bpm
            {item
              ? ` · best clean ${item.bestCleanTempo ? `${item.bestCleanTempo} bpm` : '–'} · ${item.cleanRuns} clean run${item.cleanRuns === 1 ? '' : 's'} · ${dueText(item.dueAt, now)}`
              : ' · new item'}
          </p>
        </div>
        <p className="field-hint">
          In <b>Flow</b>, play each chord on the downbeat. A clean run (90% of chords, 75% timing) adds 4 bpm; a messy one takes 4 bpm off. <b>Wait</b> times how quickly you find
          each chord.
        </p>
      </section>

      <section className="section">
        <Toggle
          label="Review due items"
          hint={
            props.dueCount
              ? `${props.dueCount} item${props.dueCount === 1 ? '' : 's'} due, weakest and longest-unplayed first`
              : review
                ? 'Nothing is due, so you play your current pick.'
                : 'Drills and progressions you have played come back on a spaced schedule.'
          }
          checked={review}
          onChange={(on) => update({ chords: { source: on ? 'review' : 'pick' } })}
        />
        {drill ? (
          <Toggle
            label="Weak-spot focus"
            hint={props.weak.length ? `More of: ${props.weak.slice(0, 3).map(weakChordLabel).join(', ')}` : 'Draws more of the chords you miss or find slowly, once there is data.'}
            checked={s.weakSpotFocus}
            onChange={(weakSpotFocus) => update({ weakSpotFocus })}
          />
        ) : null}
      </section>

      <section className="section">
        <div className="section-title">Display</div>
        <Select<number>
          label="Mastery goal"
          value={goal}
          onChange={(chordsGoalBpm) => update({ chords: { goalBpm: chordsGoalBpm } })}
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
