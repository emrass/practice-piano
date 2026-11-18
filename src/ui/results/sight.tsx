import { cleanPitch, wrongNote, pct, verdict } from './format';
import type { ResultsView } from './types';
import { StatTile } from '../components/controls';

/** Sight reading. Body is defined inline so this file only exports the view (react-refresh). */
export const sightResults: ResultsView = {
  ribbon: (result, passed) => (passed ? '90% or better. Counts toward mastery.' : `Needs 90% pitch accuracy to pass.${result.hints ? ' Hints count as misses.' : ''}`),
  headline: (result, passed) => verdict(result, passed, cleanPitch(result)),
  repertoire: false,
  trains: 'sight reading',
  Body: function SightResults({ result }) {
    const flow = result.mode === 'flow';
    return (
      <div className="results-grid">
        <StatTile main value={pct(result.pitchAccuracy)} note="Pitch accuracy" />
        {flow ? (
          <StatTile value={pct(result.timingAccuracy)} note={`Timing${result.meanAbsTimingMs !== null ? ` · ±${Math.round(result.meanAbsTimingMs)} ms` : ''}`} />
        ) : (
          <StatTile value={result.medianReactionMs === null ? '–' : `${(result.medianReactionMs / 1000).toFixed(2)} s`} note="Median reaction" />
        )}
        <StatTile value={`${result.cleanSteps}/${result.totalSteps}`} note={flow ? 'Steps fully hit' : 'First-try steps'} />
        <StatTile value={result.wrongNotes + result.missedNotes} note={flow ? 'Wrong + missed' : wrongNote(result, 'Wrong notes')} />
      </div>
    );
  },
};
