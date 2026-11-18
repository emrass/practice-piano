import { useEffect, useRef } from 'react';
import type { ExerciseResult } from '../../core/eval/types';
import { findTier } from '../../core/lessons';
import { isPass, type Award } from '../../core/progress/progress';
import { pianoLegend } from '../lessons/continuation';
import type { Continuation } from '../lessons/types';
import { resultsView } from '../results';
import { Callout, ProgressBar } from './controls';
import { Icon } from './Icon';

/**
 * End-of-run card (the design system's Results): shared chrome here, the lesson's ribbon, verdict
 * and measurements from its ResultsView, and its repeat / next actions from the exercise's
 * continuation. Order: ribbon, verdict, tiles, what happens next, notes, XP, actions.
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
    <div className="veil" role="dialog" aria-modal="false" aria-labelledby="results-title">
      <div className="results">
        <p className={`results-ribbon ${passed ? 'is-pass' : ''}`}>
          {passed ? <Icon name="check" /> : null}
          {view.ribbon(result, passed)}
        </p>
        <h2 className="results-verdict" id="results-title">
          {view.headline(result, passed, award)}
        </h2>
        <Body result={result} award={award} />
        {/* What happens next, for the lessons with tiers (scales and chords state theirs in the Body). */}
        {award && tier && !view.repertoire ? (
          <Callout>
            <div className="progress-row" style={{ ['--cols' as string]: 'auto 1fr auto' }}>
              <b>{tier.name}</b>
              <ProgressBar label="Tier progress" value={Math.min(award.tierPasses, award.tierRequired)} max={award.tierRequired} complete={award.newlyMastered} />
              <span className="num">
                {Math.min(award.tierPasses, award.tierRequired)}/{award.tierRequired} passes
              </span>
            </div>
            {award.newlyMastered ? <div>Tier mastered. Try the next tier when you feel ready.</div> : null}
          </Callout>
        ) : null}
        {award ? (
          <div className="stat">
            <span className="stat-value results-xp">+{award.xp} XP</span>
            {award.firstSightBonus > 0 ? <span className="stat-note">First-sight bonus +{award.firstSightBonus} XP</span> : null}
            {!award.firstAttempt && !view.repertoire && view.trains !== null ? (
              <span className="stat-note">A repeat passage earns less XP. New passages train {view.trains} best.</span>
            ) : null}
            {view.xpNotes?.(result).map((note) => (
              <span key={note} className="stat-note">
                {note}
              </span>
            ))}
          </div>
        ) : null}
        {props.pianoShortcuts ? (
          <div className="results-shortcuts" role="group" aria-label="Piano shortcuts">
            <span>Piano:</span>
            {pianoLegend(props.continuation).map((a) => (
              <span key={a.key}>
                <kbd className="kbd-piano">{a.key}</kbd>
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
