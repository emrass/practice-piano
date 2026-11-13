import type { EarExercise } from '../../core/ear/generator';
import type { Exercise } from '../../core/exercise';
import { findTier } from '../../core/lessons';
import { RHYTHM_COMPLEXITY_LABELS } from '../../core/generator/difficulty';
import { isRhythmExercise, TASK_INFO, TEXTURE_INFO } from '../../core/rhythm/generator';
import { HANDS_LABEL as SCALE_HANDS, NOTE_VALUE_LABEL } from '../../core/scales/catalog';
import { isScaleExercise, nps } from '../../core/scales/generator';
import { CHORD_SETS, chordSetExamples, findProgression } from '../../core/chords/catalog';
import { isChordExercise } from '../../core/chords/generator';

const HANDS_LABEL = { rh: 'Right hand', lh: 'Left hand', alternating: 'Alternating', both: 'Both hands' } as const;

/** Fixed-geometry facts about the current exercise (cells never change width). */
export function MetaStrip(props: { exercise: Exercise; firstSight: boolean; focus: boolean }) {
  const ex = props.exercise;
  const tier = findTier(ex.meta.tierId);
  const ear = (ex as Partial<EarExercise>).ear;
  const rhythm = isRhythmExercise(ex) ? ex.rhythm : null;
  const scale = isScaleExercise(ex) ? ex.scale : null;
  const chords = isChordExercise(ex) ? ex.chords : null;
  const ci = chords?.item;
  const items: [string, string][] = chords
    ? ci!.task === 'drill'
      ? [
          ['Chords', chordSetExamples(ci!.set)],
          ['Shown as', ci!.prompt === 'symbol' ? 'Symbols' : 'Notation'],
          ['Voicing', { any: 'Any', root: 'Root position', inversions: 'Inversions' }[ci!.inversions]],
          ['Length', `${chords.targets.length} chords`],
          ['Tempo', `${ex.bpm} bpm`],
          ['Per chord', `${(240 / ex.bpm).toFixed(1)} s`],
        ]
      : [
          ['Key', ex.key.label],
          ['Chords', `${findProgression(ci!.progression)?.chords.length ?? chords.targets.length}`],
          ['Hands', ci!.hands === 'lh-bass' ? 'RH + LH root' : 'Right hand'],
          ['Length', `${chords.targets.length} bars`],
          ['Tempo', `${ex.bpm} bpm`],
          ['Per chord', `${(240 / ex.bpm).toFixed(1)} s`],
        ]
    : scale
    ? [
        ['Key', ex.key.label === 'C major' && scale.item.type === 'chromatic' ? '—' : ex.key.label],
        ['Hands', SCALE_HANDS[scale.item.hands]],
        ['Range', `${scale.octaves} octave${scale.octaves > 1 ? 's' : ''}`],
        ['Rhythm', NOTE_VALUE_LABEL[scale.noteValue]],
        ['Tempo', `${ex.bpm} bpm${ex.timeSignature.beatTicks === 6 ? ' (♩.)' : ''}`],
        ['Speed', nps(scale.npm)],
      ]
    : rhythm
    ? [
        ['Task', TASK_INFO[rhythm.task].name],
        ['Time', ex.timeSignature.id],
        ['Tempo', `${ex.bpm} bpm${ex.timeSignature.id === '6/8' ? ' (♩.)' : ''}`],
        ['Length', `${ex.bars} bars`],
        ['Hands', HANDS_LABEL[ex.hands]],
        ['Texture', rhythm.texture ? TEXTURE_INFO[rhythm.texture].name : '—'],
      ]
    : ear
    ? [
        ['Key', ex.key.label],
        ['Phrase', `${ex.steps.length} ${ear.content === 'melody' || ear.content === 'mixed' ? 'notes' : 'chords'}`],
        ['Tempo', `${ex.bpm} bpm`],
        ['Reference', ear.firstNoteGiven ? 'First note' : 'Key only'],
        ['Cadence', ear.cadence.length ? 'Yes' : 'No'],
        ['Content', { melody: 'Melody', dyads: 'Intervals', triads: 'Triads', mixed: 'Mixed' }[ear.content]],
      ]
    : [
        ['Key', ex.key.label],
        ['Time', ex.timeSignature.id],
        ['Tempo', `${ex.bpm} bpm${ex.timeSignature.id === '6/8' ? ' (♩.)' : ''}`],
        ['Length', `${ex.bars} bars`],
        ['Hands', HANDS_LABEL[ex.hands]],
        ['Rhythm', RHYTHM_COMPLEXITY_LABELS[ex.meta.rhythmComplexity] ?? '—'],
      ];
  return (
    <div className="meta-strip">
      <div className="meta-tier">
        {scale || chords ? (
          <span className="meta-tier-name meta-item-title" title={(scale ?? chords)!.title}>
            {ci?.task === 'drill' ? CHORD_SETS[ci.set].name : ci?.task === 'progression' ? (findProgression(ci.progression)?.name ?? chords!.title) : scale!.title}
          </span>
        ) : (
          <>
            <span className="meta-level">L{ex.meta.level}</span>
            <span className="meta-tier-name" title={tier?.summary}>
              {tier?.name}
            </span>
          </>
        )}
      </div>
      {items.map(([k, v]) => (
        <div className="meta-item" key={k}>
          <span className="meta-k">{k}</span>
          <span className="meta-v">{v}</span>
        </div>
      ))}
      <div className="meta-badges">
        {scale || chords ? null : (
          <span className={`badge badge-sight ${props.firstSight ? '' : 'is-off'}`} title="Unseen passage: first-try success earns bonus XP">
            {props.firstSight ? 'First sight' : 'Repeat'}
          </span>
        )}
        <span className={`badge badge-focus ${props.focus ? '' : 'is-hidden'}`}>Weak-spot focus</span>
      </div>
    </div>
  );
}
