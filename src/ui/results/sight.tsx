import { gradeHeadline, pct } from './format';
import type { ResultsView } from './types';

/** Sight reading (also results without a lesson). Body is defined inline so this file only exports the view (react-refresh). */
export const sightResults: ResultsView = {
  ribbon: (_result, passed) => (passed ? '≥ 90% — counts toward mastery' : 'Needs ≥ 90% pitch accuracy to pass'),
  headline: (result, passed) => gradeHeadline(result, passed, 'Beautifully read!'),
  nextLabel: 'Next exercise',
  repertoire: false,
  trains: 'sight reading',
  Body: function SightResults({ result }) {
    const flow = result.mode === 'flow';
    return (
      <div className="results-grid">
        <div className="rg-item rg-main">
          <span className="rg-v">{pct(result.pitchAccuracy)}</span>
          <span className="rg-k">Pitch accuracy</span>
        </div>
        {flow ? (
          <div className="rg-item">
            <span className="rg-v">{pct(result.timingAccuracy)}</span>
            <span className="rg-k">Timing{result.meanAbsTimingMs !== null ? ` · ±${Math.round(result.meanAbsTimingMs)} ms` : ''}</span>
          </div>
        ) : (
          <div className="rg-item">
            <span className="rg-v">{result.medianReactionMs === null ? '—' : `${(result.medianReactionMs / 1000).toFixed(2)} s`}</span>
            <span className="rg-k">Median reaction</span>
          </div>
        )}
        <div className="rg-item">
          <span className="rg-v">
            {result.cleanSteps}/{result.totalSteps}
          </span>
          <span className="rg-k">{flow ? 'Steps fully hit' : 'First-try steps'}</span>
        </div>
        <div className="rg-item">
          <span className="rg-v">{result.wrongNotes + result.missedNotes}</span>
          <span className="rg-k">{flow ? 'Wrong + missed' : 'Wrong notes'}</span>
        </div>
      </div>
    );
  },
};
