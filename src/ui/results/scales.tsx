import { nps } from '../../core/scales/generator';
import { wrongNote, pct, verdict } from './format';
import { TempoChange } from './TempoChange';
import type { ResultsView } from './types';
import { Callout, StatTile } from '../components/controls';

const CROSSING_TEXT = { 'thumb-under': 'thumb under', 'finger-over': 'finger over' } as const;

/** Scales & arpeggios (repertoire). Body is defined inline so this file only exports the view (react-refresh). */
export const scalesResults: ResultsView = {
  ribbon: (result, passed) => {
    const flow = result.mode === 'flow';
    if (passed) return flow ? 'Clean run. Tempo goes up.' : 'Notes learned. Try it in Flow.';
    return flow ? 'A clean run needs 95% notes and 80% timing.' : 'Needs 90% accuracy to pass.';
  },
  // A pass in Flow is a clean run (the ladder's own word); a pass in Wait has learned the notes. Mastery
  // is said in the tempo callout, with its star.
  headline: (result, passed) => verdict(result, passed, result.mode === 'flow'),
  repertoire: true,
  trains: null,
  Body: function ScaleResults({ result, award }) {
    if (result.lesson !== 'scales') return null;
    const scale = result.scale;
    const flow = result.mode === 'flow';
    const change = award?.repertoire;
    return (
      <>
        <div className="results-grid">
          <StatTile main value={pct(result.pitchAccuracy)} note="Notes" />
          {flow ? (
            <StatTile value={pct(result.timingAccuracy)} note={`Timing${scale.steadinessMs !== null ? ` · ±${scale.steadinessMs} ms` : ''}`} />
          ) : (
            <StatTile value={result.medianReactionMs === null ? '–' : `${(result.medianReactionMs / 1000).toFixed(2)} s`} note="Per note" />
          )}
          {flow ? (
            <StatTile
              title="Spread of key velocity: lower is more even"
              value={scale.velocitySpread === null ? '–' : `±${Math.round(scale.velocitySpread * 100)}%`}
              note="Evenness"
            />
          ) : (
            <StatTile value={`${result.cleanSteps}/${result.totalSteps}`} note="First-try steps" />
          )}
          {scale.syncMs !== null ? (
            <StatTile title="Average gap between the hands on notes played together" value={`${scale.syncMs} ms`} note="Hands apart" />
          ) : (
            <StatTile value={result.wrongNotes + result.missedNotes} note={flow ? 'Wrong + missed' : wrongNote(result, 'Wrong notes')} />
          )}
        </div>
        {flow && change ? (
          <TempoChange change={change} bpm={(npm) => Math.round(npm / scale.notesPerBeat)} masteredAt={nps(scale.npm)} />
        ) : change ? (
          <Callout>Practice run. The tempo ladder and review date move only in Flow.</Callout>
        ) : null}
        {scale.bumps.length || scale.thumbAccent ? (
          <ul className="results-notes">
            {scale.bumps.map((b) => (
              <li key={`${b.hand}${b.label}`}>
                Timing bump on <b>{b.label}</b> ({b.hand === 'rh' ? 'RH' : 'LH'}
                {b.finger ? `, finger ${b.finger}` : ''}
                {b.crossing ? `, ${CROSSING_TEXT[b.crossing]}` : ''}): {Math.abs(b.ms)} ms {b.ms > 0 ? 'late' : 'early'}
              </li>
            ))}
            {scale.thumbAccent ? <li>Your thumb plays louder than the other fingers. Keep it light as it passes under.</li> : null}
          </ul>
        ) : null}
      </>
    );
  },
};
