import { gradeHeadline, pct } from './format';
import type { ResultsView } from './types';

/** Ear training (always mode 'ear'). Body is defined inline so this file only exports the view (react-refresh). */
export const earResults: ResultsView = {
  ribbon: (_result, passed) => (passed ? '≥ 90% — counts toward mastery' : 'Needs ≥ 90% (hints count as misses) to pass'),
  headline: (result, passed) => gradeHeadline(result, passed, 'Perfect ear!'),
  nextLabel: 'Next phrase',
  repertoire: false,
  trains: 'your ear',
  xpNotes: (result) => ((result.replays ?? 0) > 0 ? ['Each replay reduces XP a little — try to catch it in one listen.'] : []),
  Body: function EarResults({ result }) {
    return (
      <div className="results-grid">
        <div className="rg-item rg-main">
          <span className="rg-v">{pct(result.pitchAccuracy)}</span>
          <span className="rg-k">Pitch accuracy</span>
        </div>
        <div className="rg-item">
          <span className="rg-v">{result.replays ?? 0}</span>
          <span className="rg-k">Replays</span>
        </div>
        <div className="rg-item">
          <span className="rg-v">
            {result.cleanSteps}/{result.totalSteps}
          </span>
          <span className="rg-k">Found unaided</span>
        </div>
        <div className="rg-item">
          <span className="rg-v">{`${result.wrongNotes}/${result.hints ?? 0}`}</span>
          <span className="rg-k">Wrong / hints</span>
        </div>
      </div>
    );
  },
};
