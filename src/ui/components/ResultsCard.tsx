import { useEffect, useRef } from 'react';
import type { ExerciseResult } from '../../core/eval/types';
import { findTier } from '../../core/lessons';
import { PIANO_ACTIONS } from '../../core/input/pianoShortcuts';
import { isPass, type Award } from '../../core/progress/progress';
import { resultsView } from '../results';

/** End-of-run card: shared chrome here, the lesson's ribbon, headline, measurements and labels from its ResultsView. */
export function ResultsCard(props: {
  result: ExerciseResult;
  award: Award | null;
  pianoShortcuts: boolean;
  onNext: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { result, award } = props;
  const nextRef = useRef<HTMLButtonElement>(null);
  // Focus "Next" for Enter, without scrolling a tall card away from its top.
  useEffect(() => nextRef.current?.focus({ preventScroll: true }), []);
  const tier = award ? findTier(award.tierId) : null;
  const view = resultsView(result);
  const Body = view.Body;
  const passed = isPass(result);
  return (
    <div className="results-backdrop" role="dialog" aria-modal="false" aria-labelledby="results-title">
      <div className="results-card">
        <div className={`results-ribbon ${passed ? 'is-pass' : 'is-fail'}`}>{view.ribbon(result, passed)}</div>
        <h2 id="results-title">{view.headline(result, passed, award)}</h2>
        <Body result={result} award={award} />
        {award ? (
          <div className="results-xp">
            <span className="xp-total">+{award.xp} XP</span>
            {award.firstSightBonus > 0 ? <span className="xp-bonus">incl. first-sight bonus +{award.firstSightBonus}</span> : null}
            {!award.firstAttempt && !view.repertoire && view.trains !== null ? (
              <span className="xp-note">Repeat passage — reduced XP. New passages train {view.trains} best.</span>
            ) : null}
            {view.xpNotes?.(result).map((note) => (
              <span key={note} className="xp-note">
                {note}
              </span>
            ))}
            {award.levelCapped ? <span className="xp-note">XP multiplier capped at level {award.effectiveLevel} — master lower tiers to raise it.</span> : null}
          </div>
        ) : null}
        {award && tier && !view.repertoire ? (
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
          <button type="button" className="btn btn-primary" onClick={props.onNext} ref={nextRef}>
            {view.nextLabel} <kbd>Enter</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
