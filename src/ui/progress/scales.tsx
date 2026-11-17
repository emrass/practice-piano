import { dueItems } from '../../core/repertoire/repertoire';
import { HANDS_LABEL, itemTitle, parseItemId } from '../../core/scales/catalog';
import { nps } from '../../core/scales/generator';
import { RepertoireList } from './RepertoireList';
import type { ProgressSectionProps } from './types';

/** Scales & arpeggios: every item played, with its ladder tempo, mastery and review date. */
export function RepertoireStats(props: ProgressSectionProps) {
  const goalNps = props.settings.scales.goalNps;
  const entries = Object.entries(props.progress.repertoire)
    .map(([id, it]) => ({ id, it, item: parseItemId(id) }))
    .filter((e) => e.item)
    .sort((a, b) => b.it.lastAt - a.it.lastAt);
  const due = dueItems(props.progress.repertoire, props.now).filter((id) => parseItemId(id));
  const mastered = entries.filter((e) => e.it.mastered).length;
  if (!entries.length) {
    return (
      <section className="panel-section">
        <div className="section-title">Your scales</div>
        <p className="field-hint">Items you play appear here with their tempo ladder, and come back for review on a spaced schedule.</p>
      </section>
    );
  }
  return (
    <section className="panel-section">
      <div className="section-title">
        Your scales <span className="muted">· {mastered}/{entries.length} mastered</span>
      </div>
      <RepertoireList
        entries={entries.map(({ id, it, item }) => ({
          id,
          it,
          title: (
            <>
              {itemTitle(item!.type, item!.tonic)}
              <small>{HANDS_LABEL[item!.hands]}</small>
            </>
          ),
        }))}
        goal={goalNps * 60}
        format={nps}
        now={props.now}
      />
      <button type="button" className="btn btn-block" disabled={due.length === 0} onClick={props.onReview}>
        Review due items{due.length ? ` (${due.length})` : ''}
      </button>
    </section>
  );
}
