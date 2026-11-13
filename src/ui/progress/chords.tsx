import { weakChordLabel } from '../../core/chords/analysis';
import { chordItemTitle, parseChordItemId, QUALITIES, type ChordQuality } from '../../core/chords/catalog';
import { median } from '../../core/eval/types';
import { findWeakChords } from '../../core/progress/progress';
import { dueItems } from '../../core/repertoire/repertoire';
import { DAY, pct } from './format';
import type { ProgressSectionProps } from './types';

/** Chords & progressions: accuracy and speed per chord quality, weak spots, and the items' ladders. */
export function ChordStats(props: ProgressSectionProps) {
  const { progress } = props;
  const goalBpm = props.settings.chords.goalBpm;
  const qualities = Object.entries(progress.stats.chordQuality ?? {}).sort(
    (a, b) => Object.keys(QUALITIES).indexOf(a[0]) - Object.keys(QUALITIES).indexOf(b[0]),
  );
  const weak = findWeakChords(progress);
  const entries = Object.entries(progress.repertoire)
    .map(([id, it]) => ({ id, it, item: parseChordItemId(id) }))
    .filter((e) => e.item)
    .sort((a, b) => b.it.lastAt - a.it.lastAt);
  const due = dueItems(progress.repertoire, props.now).filter((id) => parseChordItemId(id));
  const mastered = entries.filter((e) => e.it.mastered).length;
  return (
    <>
      <section className="panel-section">
        <div className="section-title">Chord qualities</div>
        {qualities.length ? (
          <div className="clef-bars interval-bars">
            {qualities.map(([q, agg]) => {
              const acc = agg.correct / Math.max(1, agg.attempts);
              const med = median(agg.reactions);
              return (
                <div key={q} className="clef-bar" title={`${agg.correct}/${agg.attempts} right first time${med ? ` · found in ${(med / 1000).toFixed(1)} s (median)` : ''}`}>
                  <span>{QUALITIES[q as ChordQuality]?.name ?? q}</span>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${acc * 100}%` }} />
                  </div>
                  <span>{pct(acc)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="field-hint">Accuracy and speed per chord quality appear after your first drill.</p>
        )}
        {weak.length ? (
          <ul className="weak-list">
            {weak.map((w) => (
              <li key={`${w.dimension}${w.key}`}>
                <span className="weak-note">{weakChordLabel(w)}</span>
                <span>{pct(w.accuracy)}</span>
                <span className="muted">{w.medianReactionMs ? `${(w.medianReactionMs / 1000).toFixed(1)}s` : ''}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" className="btn btn-block" disabled={weak.length === 0} onClick={props.onPracticeWeakSpots}>
          Drill weak chords
        </button>
      </section>
      <section className="panel-section">
        <div className="section-title">
          Your chords <span className="muted">· {mastered}/{entries.length} mastered</span>
        </div>
        {entries.length ? (
          <ul className="repertoire-list">
            {entries.map(({ id, it, item }) => {
              const days = Math.ceil((it.dueAt - props.now) / DAY);
              return (
                <li key={id} className={it.mastered ? 'is-mastered' : ''}>
                  <span className="rep-name">{chordItemTitle(item!)}</span>
                  <span className="rep-tempo" title="Ladder tempo">
                    ♩ {it.ladderTempo}
                  </span>
                  <span className="rep-state">{it.mastered ? '★' : days <= 0 ? 'due' : `${days}d`}</span>
                  <div className="progress-track">
                    <div className={`progress-fill ${it.mastered ? 'is-mastered' : ''}`} style={{ width: `${Math.min(100, (it.ladderTempo / goalBpm) * 100)}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="field-hint">Drills and progressions you play appear here with their tempo ladder, and come back for review on a spaced schedule.</p>
        )}
        <button type="button" className="btn btn-block" disabled={due.length === 0} onClick={props.onReview}>
          Review due items{due.length ? ` (${due.length})` : ''}
        </button>
      </section>
    </>
  );
}
