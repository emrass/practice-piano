import type { Exercise } from '../../core/exercise';
import { TIERS } from '../../core/generator/tiers';
import { RHYTHM_COMPLEXITY_LABELS } from '../../core/generator/difficulty';

const HANDS_LABEL = { rh: 'Right hand', lh: 'Left hand', alternating: 'Alternating', both: 'Both hands' } as const;

/** Fixed-geometry facts about the current exercise (cells never change width). */
export function MetaStrip(props: { exercise: Exercise; firstSight: boolean; focus: boolean }) {
  const ex = props.exercise;
  const tier = TIERS.find((t) => t.id === ex.meta.tierId);
  const items: [string, string][] = [
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
        <span className="meta-level">L{ex.meta.level}</span>
        <span className="meta-tier-name" title={tier?.summary}>
          {tier?.name}
        </span>
      </div>
      {items.map(([k, v]) => (
        <div className="meta-item" key={k}>
          <span className="meta-k">{k}</span>
          <span className="meta-v">{v}</span>
        </div>
      ))}
      <div className="meta-badges">
        <span className={`badge badge-sight ${props.firstSight ? '' : 'is-off'}`} title="Unseen passage: first-try success earns bonus XP">
          {props.firstSight ? 'First sight' : 'Repeat'}
        </span>
        <span className={`badge badge-focus ${props.focus ? '' : 'is-hidden'}`}>Weak-spot focus</span>
      </div>
    </div>
  );
}
