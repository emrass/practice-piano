import type { ExerciseResult } from '../../core/eval/types';
import { findTier } from '../../core/lessons';
import { PIANO_ACTIONS } from '../../core/input/pianoShortcuts';
import type { Award } from '../../core/progress/progress';

function pct(v: number | null): string {
  return v === null ? '—' : `${Math.round(v * 100)}%`;
}

export function ResultsCard(props: {
  result: ExerciseResult;
  award: Award | null;
  pianoShortcuts: boolean;
  onNext: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { result, award } = props;
  const tier = award ? findTier(award.tierId) : null;
  const ear = result.mode === 'ear';
  const passed = result.pitchAccuracy >= 0.9;
  const headline = result.pitchAccuracy >= 0.98 ? (ear ? 'Perfect ear!' : 'Beautifully read!') : passed ? 'Passed!' : result.pitchAccuracy >= 0.75 ? 'Nearly there' : 'Keep practising';
  return (
    <div className="results-backdrop" role="dialog" aria-modal="false" aria-labelledby="results-title">
      <div className="results-card">
        <div className={`results-ribbon ${passed ? 'is-pass' : 'is-fail'}`}>
          {passed ? '≥ 90% — counts toward mastery' : ear ? 'Needs ≥ 90% (hints count as misses) to pass' : 'Needs ≥ 90% pitch accuracy to pass'}
        </div>
        <h2 id="results-title">{headline}</h2>
        <div className="results-grid">
          <div className="rg-item rg-main">
            <span className="rg-v">{pct(result.pitchAccuracy)}</span>
            <span className="rg-k">Pitch accuracy</span>
          </div>
          {ear ? (
            <div className="rg-item">
              <span className="rg-v">{result.replays ?? 0}</span>
              <span className="rg-k">Replays</span>
            </div>
          ) : result.mode === 'flow' ? (
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
            <span className="rg-k">{result.mode === 'flow' ? 'Steps fully hit' : ear ? 'Found unaided' : 'First-try steps'}</span>
          </div>
          <div className="rg-item">
            <span className="rg-v">{ear ? `${result.wrongNotes}/${result.hints ?? 0}` : result.wrongNotes + result.missedNotes}</span>
            <span className="rg-k">{result.mode === 'flow' ? 'Wrong + missed' : ear ? 'Wrong / hints' : 'Wrong notes'}</span>
          </div>
        </div>
        {award ? (
          <div className="results-xp">
            <span className="xp-total">+{award.xp} XP</span>
            {award.firstSightBonus > 0 ? <span className="xp-bonus">incl. first-sight bonus +{award.firstSightBonus}</span> : null}
            {!award.firstAttempt ? <span className="xp-note">Repeat passage — reduced XP. New passages train {ear ? 'your ear' : 'sight reading'} best.</span> : null}
            {ear && (result.replays ?? 0) > 0 ? <span className="xp-note">Each replay reduces XP a little — try to catch it in one listen.</span> : null}
            {award.levelCapped ? <span className="xp-note">XP multiplier capped at level {award.effectiveLevel} — master lower tiers to raise it.</span> : null}
          </div>
        ) : null}
        {award && tier ? (
          <div className="results-tier">
            <div className="rt-head">
              <span>{tier.name}</span>
              <span>
                {Math.min(award.tierPasses, award.tierRequired)}/{award.tierRequired} passes
              </span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.min(100, (award.tierPasses / award.tierRequired) * 100)}%` }} />
            </div>
            {award.newlyMastered ? <div className="rt-mastered">Tier mastered! Try the next band when you feel ready.</div> : null}
          </div>
        ) : null}
        {props.pianoShortcuts ? (
          <div className="piano-legend" aria-label="Piano shortcuts">
            <span className="muted">Piano:</span>
            {PIANO_ACTIONS.map((a) => (
              <span key={a.key} className="legend-item">
                <span className="legend-key">{a.key}</span>
                {a.label}
              </span>
            ))}
          </div>
        ) : null}
        <div className="results-actions">
          <button type="button" className="btn btn-ghost" onClick={props.onClose}>
            Close <kbd>Esc</kbd>
          </button>
          <button type="button" className="btn" onClick={props.onRetry}>
            Retry <kbd>R</kbd>
          </button>
          <button type="button" className="btn btn-primary" onClick={props.onNext} autoFocus>
            {ear ? 'Next phrase' : 'Next exercise'} <kbd>Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
