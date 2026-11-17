import { gradeHeadline, pct } from './format';
import type { ResultsView } from './types';
import { StatTile } from '../components/controls';

/** Ear training (always mode 'ear'). Body is defined inline so this file only exports the view (react-refresh). */
export const earResults: ResultsView = {
  ribbon: (_result, passed) => (passed ? '≥ 90% — counts toward mastery' : 'Needs ≥ 90% (hints count as misses) to pass'),
  headline: (result, passed) => gradeHeadline(result, passed, 'Perfect ear!'),
  repertoire: false,
  trains: 'your ear',
  xpNotes: (result) => (result.lesson === 'ear' && result.replays > 0 ? ['Each replay reduces XP a little — try to catch it in one listen.'] : []),
  Body: function EarResults({ result }) {
    if (result.lesson !== 'ear') return null;
    return (
      <div className="results-grid">
        <StatTile main value={pct(result.pitchAccuracy)} note="Pitch accuracy" />
        <StatTile value={result.replays} note="Replays" />
        <StatTile value={`${result.cleanSteps}/${result.totalSteps}`} note="Found unaided" />
        <StatTile value={`${result.wrongNotes}/${result.hints}`} note="Wrong / hints" />
      </div>
    );
  },
};
