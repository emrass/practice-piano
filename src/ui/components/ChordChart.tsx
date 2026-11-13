import type { ChordExercise } from '../../core/chords/generator';
import { useStore } from '../../lib/store';
import type { Session } from '../practice/session';

/**
 * Chords without notation: a lead-sheet style chart, one card per bar. The card being asked
 * for is marked; played ones take their result colour.
 */
export function ChordChart(props: { exercise: ChordExercise; controller: Session }) {
  const state = useStore(props.controller.state);
  const { targets, item, title } = props.exercise.chords;
  const finished = state.status === 'finished';
  const current = finished ? -1 : (state.chords?.index ?? state.stepIndex);
  const perRow = targets.length % 4 === 0 ? 4 : targets.length % 3 === 0 ? 3 : 4;
  return (
    <div className="chord-chart" aria-label={title}>
      <div className="chord-chart-title">{title}</div>
      <ol className="chord-grid" style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 1fr))` }}>
        {targets.map((t) => {
          const mark = state.marks[t.index];
          const cls = [
            'chord-card',
            t.index === current && state.status !== 'ready' ? 'is-current' : '',
            t.index === current && state.status === 'ready' ? 'is-next' : '',
            mark ? `is-${mark}` : '',
          ].join(' ');
          return (
            <li key={t.index} className={cls} aria-current={t.index === current ? 'step' : undefined}>
              <span className="chord-card-symbol">{t.symbol}</span>
              {t.numeral ? <span className="chord-card-numeral">{t.numeral}</span> : null}
              {item.task === 'drill' && t.bassPc !== null && t.spec.inversion > 0 ? (
                <span className="chord-card-numeral">{['', '1st inv.', '2nd inv.', '3rd inv.'][t.spec.inversion]}</span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {state.chords?.bassHint && !finished ? <div className="chord-hint">{state.chords.bassHint}</div> : null}
    </div>
  );
}
