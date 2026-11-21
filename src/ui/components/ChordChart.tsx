import { bassOf } from '../../core/chords/catalog';
import type { ChordExercise } from '../../core/chords/generator';
import { pitchLabel } from '../../core/music/pitch';
import { useStore } from '../../lib/store';
import type { Session, StepMark } from '../practice/session';
import { Icon } from './Icon';

/** The mark in a played cell's corner, the second cue beside its color, and its name for screen readers. */
const CELL_MARK: Partial<Record<StepMark, { name: string; glyph: 'check' | '~' | '×' }>> = {
  good: { name: 'right', glyph: 'check' },
  ok: { name: 'nearly', glyph: '~' },
  bad: { name: 'wrong', glyph: '×' },
  missed: { name: 'missed', glyph: '×' },
};

/**
 * Chords without notation (the design system's ChordChart): a lead-sheet grid, one cell per bar.
 * The cell being asked for is marked; played ones take their result color and a mark.
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
      <ol className="chord-grid" style={{ ['--bars' as string]: perRow }}>
        {targets.map((t) => {
          const mark = state.marks[t.index];
          const cue = mark ? CELL_MARK[mark] : undefined;
          return (
            <li key={t.index} className={`chord-cell ${mark ? `is-${mark}` : ''}`} aria-current={t.index === current ? 'true' : undefined}>
              <span className="chord-cell-symbol">{t.symbol}</span>
              {t.numeral ? <span className="chord-cell-numeral">{t.numeral}</span> : null}
              {item.task === 'drill' && t.bassPc !== null && t.spec.inversion > 0 ? (
                <span className="chord-cell-numeral">{['', '1st inv.', '2nd inv.', '3rd inv.'][t.spec.inversion]}</span>
              ) : null}
              {cue ? (
                <span className="chord-cell-mark" role="img" aria-label={cue.name}>
                  {cue.glyph === 'check' ? <Icon name="check" /> : cue.glyph}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {/* The short form of the hint; the practice bar says it as a sentence. */}
      {state.chords?.bassHint && !finished && targets[current] ? <span className="badge badge-accent">{pitchLabel(bassOf(targets[current].spec))} in the bass</span> : null}
    </div>
  );
}
