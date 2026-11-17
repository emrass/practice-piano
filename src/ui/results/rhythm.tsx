import { gradeHeadline, offsetTile, pct } from './format';
import type { ResultsView } from './types';
import { StatTile } from '../components/controls';

/** Rhythm. Body is defined inline so this file only exports the view (react-refresh). */
export const rhythmResults: ResultsView = {
  ribbon: (_result, passed) => (passed ? 'In time — counts toward mastery' : 'Needs ≥ 90% hits and ≥ 70% timing to pass'),
  headline: (result, passed) => {
    const rhythm = result.lesson === 'rhythm' ? result.rhythm : null;
    // 'Right in the pocket!' also needs good timing and no clear rushing/dragging or drift.
    const inThePocket =
      !rhythm ||
      ((result.timingAccuracy ?? 0) >= 0.9 && Math.abs(rhythm.driftMs ?? 0) < 40 && Math.abs(rhythm.tendencyMs ?? 0) < 40);
    return gradeHeadline(result, passed, 'Right in the pocket!', inThePocket);
  },
  repertoire: false,
  trains: 'your rhythm',
  Body: function RhythmResults({ result }) {
    if (result.lesson !== 'rhythm') return null;
    const rhythm = result.rhythm;
    return (
      <div className="results-grid">
        <StatTile main value={pct(result.pitchAccuracy)} note="Hits" />
        <StatTile value={pct(result.timingAccuracy)} note={`Timing${result.meanAbsTimingMs !== null ? ` · ±${Math.round(result.meanAbsTimingMs)} ms` : ''}`} />
        <StatTile title="Average offset: early = rushing, late = dragging" {...offsetTile('Tendency', rhythm.tendencyMs, 'early', 'late')} />
        {rhythm.task === 'pulse' ? (
          <StatTile title="Silent bars compared with clicked bars" {...offsetTile('Drift when silent', rhythm.driftMs, 'rushing', 'dragging')} />
        ) : (
          <StatTile title="Spread of your timing — lower is steadier" value={rhythm.steadinessMs === null ? '—' : `±${rhythm.steadinessMs} ms`} note="Steadiness" />
        )}
        {rhythm.hands.rh && rhythm.hands.lh ? (
          <div className="stat stat-tile stat-tile-wide">
            <span className="stat-note">
              Right hand <b>{pct(rhythm.hands.rh.hitRate)}</b> · timing {pct(rhythm.hands.rh.timing)} — Left hand <b>{pct(rhythm.hands.lh.hitRate)}</b> · timing{' '}
              {pct(rhythm.hands.lh.timing)}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
};
