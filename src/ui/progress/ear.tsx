import { useMemo } from 'react';
import { findWeakIntervals, INTERVAL_NAMES, type ProgressState } from '../../core/progress/progress';
import { pct } from './format';
import { TierMastery } from './TierMastery';
import type { ProgressSectionProps } from './types';

/** Accuracy per melodic interval, then harmonic intervals and chords. */
function IntervalBars(props: { progress: ProgressState }) {
  const stats = props.progress.stats.interval ?? {};
  const harmony = props.progress.stats.harmony ?? {};
  const rows = INTERVAL_NAMES.map((name, semis) => ({ name, agg: stats[String(semis)] })).filter((r) => r.agg);
  const chordRows = Object.entries(harmony).map(([k, agg]) => ({
    name: k.startsWith('h') ? `${INTERVAL_NAMES[Math.min(12, Number(k.slice(1)))]} (harmonic)` : k === 'triad' ? 'Triads' : 'Sevenths',
    agg,
  }));
  if (!rows.length && !chordRows.length) return <p className="field-hint">Interval accuracy appears after your first phrases.</p>;
  return (
    <div className="clef-bars interval-bars">
      {[...rows, ...chordRows].map((r) => {
        const acc = r.agg.correct / Math.max(1, r.agg.attempts);
        return (
          <div key={r.name} className="clef-bar" title={`${r.agg.correct}/${r.agg.attempts} found unaided`}>
            <span>{r.name}</span>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${acc * 100}%` }} />
            </div>
            <span>{pct(acc)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Ear training: interval bars, weakest intervals and the tier ladder. */
export function EarSection(props: ProgressSectionProps) {
  const { progress } = props;
  const weakIntervals = useMemo(() => findWeakIntervals(progress), [progress]);
  return (
    <>
      <section className="panel-section">
        <div className="section-title">Intervals</div>
        <IntervalBars progress={progress} />
        {weakIntervals.length ? (
          <p className="field-hint">Weakest: {weakIntervals.map((w) => `${INTERVAL_NAMES[w.semitones]} (${pct(w.accuracy)})`).join(', ')}</p>
        ) : null}
        <button type="button" className="btn btn-block" disabled={weakIntervals.length === 0} onClick={props.onPracticeWeakSpots}>
          Practise weak intervals
        </button>
      </section>

      <TierMastery lesson="ear" level={props.settings.ear.level} progress={progress} />
    </>
  );
}
