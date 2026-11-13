import { nps } from '../../core/scales/generator';
import { gradeHeadline, hintNote, pct } from './format';
import type { ResultsView } from './types';

const CROSSING_TEXT = { 'thumb-under': 'thumb under', 'finger-over': 'finger over' } as const;

/** Scales & arpeggios (repertoire). Body is defined inline so this file only exports the view (react-refresh). */
export const scalesResults: ResultsView = {
  ribbon: (result, passed) => {
    const flow = result.mode === 'flow';
    if (passed) return flow ? 'Clean run — tempo goes up' : 'Notes learned — try it in Flow';
    return flow ? 'A clean run needs ≥ 95% notes and ≥ 80% timing' : 'Needs ≥ 90% accuracy';
  },
  headline: (result, passed, award) => {
    if (!passed) return gradeHeadline(result, passed);
    if (result.mode !== 'flow') return 'Notes in place!';
    return award?.repertoire?.newlyMastered ? 'Mastered!' : 'Clean!';
  },
  nextLabel: 'Next',
  repertoire: true,
  trains: null,
  Body: function ScaleResults({ result, award }) {
    const scale = result.scale!;
    const flow = result.mode === 'flow';
    const change = award?.repertoire;
    const bpm = (npm: number) => `${Math.round(npm / scale.notesPerBeat)} bpm`;
    return (
      <>
        <div className="results-grid">
          <div className="rg-item rg-main">
            <span className="rg-v">{pct(result.pitchAccuracy)}</span>
            <span className="rg-k">Notes</span>
          </div>
          {flow ? (
            <div className="rg-item">
              <span className="rg-v">{pct(result.timingAccuracy)}</span>
              <span className="rg-k">Timing{scale.steadinessMs !== null ? ` · ±${scale.steadinessMs} ms` : ''}</span>
            </div>
          ) : (
            <div className="rg-item">
              <span className="rg-v">{result.medianReactionMs === null ? '—' : `${(result.medianReactionMs / 1000).toFixed(2)} s`}</span>
              <span className="rg-k">Per note</span>
            </div>
          )}
          {flow ? (
            <div className="rg-item" title="Spread of key velocity — lower is more even">
              <span className="rg-v rg-v-small">{scale.velocitySpread === null ? '—' : `±${Math.round(scale.velocitySpread * 100)}%`}</span>
              <span className="rg-k">Evenness (touch)</span>
            </div>
          ) : (
            <div className="rg-item">
              <span className="rg-v">
                {result.cleanSteps}/{result.totalSteps}
              </span>
              <span className="rg-k">First-try steps</span>
            </div>
          )}
          {scale.syncMs !== null ? (
            <div className="rg-item" title="Average gap between the hands on notes played together">
              <span className="rg-v rg-v-small">{scale.syncMs} ms</span>
              <span className="rg-k">Hands apart</span>
            </div>
          ) : (
            <div className="rg-item">
              <span className="rg-v">{result.wrongNotes + result.missedNotes}</span>
              <span className="rg-k">{flow ? 'Wrong + missed' : `Wrong notes${hintNote(result)}`}</span>
            </div>
          )}
        </div>
        {flow && change ? (
          <div className={`scale-ladder ${change.toTempo > change.fromTempo ? 'is-up' : change.toTempo < change.fromTempo ? 'is-down' : ''}`}>
            {change.toTempo > change.fromTempo
              ? `Tempo up: ${bpm(change.fromTempo)} → ${bpm(change.toTempo)}`
              : change.toTempo < change.fromTempo
                ? `Tempo down to ${bpm(change.toTempo)} — get it clean first`
                : `Tempo stays at ${bpm(change.toTempo)}`}
            {change.newlyMastered ? ` · ★ mastered at ${nps(scale.npm)}` : ''}
            {change.dueInDays > 0 ? ` · review in ${change.dueInDays} day${change.dueInDays === 1 ? '' : 's'}` : ''}
          </div>
        ) : change ? (
          <div className="scale-ladder is-wait">Practice run — the tempo ladder and review date move only in Flow</div>
        ) : null}
        {scale.bumps.length || scale.thumbAccent ? (
          <ul className="scale-notes">
            {scale.bumps.map((b) => (
              <li key={`${b.hand}${b.label}`}>
                Timing bump on <b>{b.label}</b> ({b.hand === 'rh' ? 'RH' : 'LH'}
                {b.finger ? `, finger ${b.finger}` : ''}
                {b.crossing ? `, ${CROSSING_TEXT[b.crossing]}` : ''}): {Math.abs(b.ms)} ms {b.ms > 0 ? 'late' : 'early'}
              </li>
            ))}
            {scale.thumbAccent ? <li>Your thumb plays louder than the other fingers — keep it light as it passes under.</li> : null}
          </ul>
        ) : null}
      </>
    );
  },
};
