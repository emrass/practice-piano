import { gradeHeadline, pct, signedMs } from './format';
import type { ResultsView } from './types';

/** Rhythm. Body is defined inline so this file only exports the view (react-refresh). */
export const rhythmResults: ResultsView = {
  ribbon: (_result, passed) => (passed ? 'In time — counts toward mastery' : 'Needs ≥ 90% hits and ≥ 70% timing to pass'),
  headline: (result, passed) => {
    const rhythm = result.rhythm;
    // 'Right in the pocket!' also needs good timing and no clear rushing/dragging or drift.
    const inThePocket =
      !rhythm ||
      ((result.timingAccuracy ?? 0) >= 0.9 && Math.abs(rhythm.driftMs ?? 0) < 40 && Math.abs(rhythm.tendencyMs ?? 0) < 40);
    return gradeHeadline(result, passed, 'Right in the pocket!', inThePocket);
  },
  nextLabel: 'Next rhythm',
  repertoire: false,
  trains: 'your rhythm',
  Body: function RhythmResults({ result }) {
    const rhythm = result.rhythm!;
    return (
      <div className="results-grid">
        <div className="rg-item rg-main">
          <span className="rg-v">{pct(result.pitchAccuracy)}</span>
          <span className="rg-k">Hits</span>
        </div>
        <div className="rg-item">
          <span className="rg-v">{pct(result.timingAccuracy)}</span>
          <span className="rg-k">Timing{result.meanAbsTimingMs !== null ? ` · ±${Math.round(result.meanAbsTimingMs)} ms` : ''}</span>
        </div>
        <div className="rg-item" title="Average offset: early = rushing, late = dragging">
          <span className="rg-v rg-v-small">{signedMs(rhythm.tendencyMs, 'early', 'late')}</span>
          <span className="rg-k">Tendency</span>
        </div>
        {rhythm.task === 'pulse' ? (
          <div className="rg-item" title="Silent bars compared with clicked bars">
            <span className="rg-v rg-v-small">{signedMs(rhythm.driftMs, 'rushing', 'dragging')}</span>
            <span className="rg-k">Drift when silent</span>
          </div>
        ) : (
          <div className="rg-item" title="Spread of your timing — lower is steadier">
            <span className="rg-v rg-v-small">{rhythm.steadinessMs === null ? '—' : `±${rhythm.steadinessMs} ms`}</span>
            <span className="rg-k">Steadiness</span>
          </div>
        )}
        {rhythm.hands.rh && rhythm.hands.lh ? (
          <div className="rg-item rg-wide">
            <span className="rg-k">
              Right hand <b>{pct(rhythm.hands.rh.hitRate)}</b> · timing {pct(rhythm.hands.rh.timing)} — Left hand <b>{pct(rhythm.hands.lh.hitRate)}</b> · timing{' '}
              {pct(rhythm.hands.lh.timing)}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
};
