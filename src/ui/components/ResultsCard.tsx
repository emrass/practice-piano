import { useEffect, useRef } from 'react';
import type { ExerciseResult } from '../../core/eval/types';
import { findTier } from '../../core/lessons';
import { isPass, type Award } from '../../core/progress/progress';
import { pianoLegend } from '../lessons/continuation';
import type { Continuation } from '../lessons/types';
import { resultsView } from '../results';
import { ProgressBar } from './controls';

/**
 * End-of-run card: shared chrome here, the lesson's ribbon, headline and measurements from its
 * ResultsView, and its repeat / next actions from the exercise's continuation.
 */
export function ResultsCard(props: {
  result: ExerciseResult;
  award: Award | null;
  continuation: Continuation;
  pianoShortcuts: boolean;
  onNext: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  const { result, award } = props;
  const { repeat, next, primary } = props.continuation;
  const actions = [
    { id: 'repeat', label: repeat.label, shortcut: 'R', run: props.onRetry },
    ...(next ? [{ id: 'next', label: next.label, shortcut: 'N', run: props.onNext }] : []),
  ];
  const primaryRef = useRef<HTMLButtonElement>(null);
  // Focus the suggested action for Enter, without scrolling a tall card away from its top.
  useEffect(() => primaryRef.current?.focus({ preventScroll: true }), []);
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
            <ProgressBar label="Tier progress" value={Math.min(award.tierPasses, award.tierRequired)} max={award.tierRequired} complete={award.newlyMastered} />
            {award.newlyMastered ? <div className="rt-mastered">Tier mastered! Try the next band when you feel ready.</div> : null}
          </div>
        ) : null}
        {props.pianoShortcuts ? (
          <div className="piano-legend" aria-label="Piano shortcuts">
            <span className="muted">Piano:</span>
            {pianoLegend(props.continuation).map((a) => (
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
          {actions.map((a) => {
            const suggested = a.id === primary;
            return (
              <button key={a.id} type="button" className={suggested ? 'btn btn-primary' : 'btn'} onClick={a.run} ref={suggested ? primaryRef : undefined}>
                {a.label} <kbd>{suggested ? 'Enter' : a.shortcut}</kbd>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
