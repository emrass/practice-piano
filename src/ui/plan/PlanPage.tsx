import { useEffect, useMemo, useRef } from 'react';
import { PianoShortcutGate } from '../../core/input/pianoShortcuts';
import { LESSONS } from '../../core/lessons';
import { blockOutcome, blockState, dayTotals, isFinished, planMinutes, type PlanDay } from '../../core/plan/day';
import { dayKey, displayStreak, type ProgressState } from '../../core/progress/progress';
import { dueItems } from '../../core/repertoire/repertoire';
import { inputBus } from '../../input/inputBus';
import { Callout, ProgressBar, StatTile } from '../components/controls';
import { Icon } from '../components/Icon';
import { Pips, StepMark } from './PlanSteps';
import { LESSON_WORDS } from './usePlan';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Today's plan page: where Today opens, and where it ends. The blocks are listed in order with
 * the reason for each; the one that is next carries the way on (Enter, or D on the piano). Once
 * every block is played or skipped the same page is the summary of the day.
 */
export function PlanPage(props: {
  day: PlanDay;
  progress: ProgressState;
  pianoShortcuts: boolean;
  /** A dialog is open: it takes the keys. */
  inert: boolean;
  onStart: () => void;
  onSkip: () => void;
  /** Bring a skipped block back. */
  onRestore: (index: number) => void;
  onFreePractice: () => void;
}) {
  const { day, progress, onStart } = props;
  const finished = isFinished(day);
  const empty = day.blocks.length === 0;
  const minutes = planMinutes(day);
  const now = new Date();
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // The way on has the focus, so Enter takes it (as on the results card).
  const startRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!props.inert) startRef.current?.focus({ preventScroll: true });
  }, [day.at, props.inert]);

  // D on the piano starts the next block, from silence and after a moment, like the shortcuts after a run.
  const gate = useMemo(() => new PianoShortcutGate(), []);
  const canStart = props.pianoShortcuts && !props.inert && !finished && !empty;
  useEffect(() => {
    gate.finish(performance.now());
    return inputBus.subscribe((ev) => {
      if (gate.handle(ev) === 'next' && canStart) onStart();
    });
  }, [gate, canStart, onStart, day.at]);

  const totals = dayTotals(day);
  const streak = displayStreak(progress.streak, dayKey(now));
  const dueTomorrow = finished ? dueItems(progress.repertoire, now.getTime() + DAY_MS).length : 0;

  return (
    <main className="plan-page">
      <section className="card plan-sheet" aria-labelledby="plan-title">
        <header className="plan-head">
          <p className="plan-eyebrow">{date}</p>
          <h2 className="plan-title" id="plan-title">
            {finished && !empty ? 'Done for today' : "Today's practice"}
          </h2>
        </header>
        {empty ? (
          <Callout title="Nothing is in your plan">Switch on a lesson under Plan, in the sidebar.</Callout>
        ) : finished ? (
          <div className="results-grid">
            <StatTile main value={`${Math.max(1, Math.round(totals.playedMs / 60_000))} min`} note="Playing time" />
            <StatTile value={totals.exercises ? `${totals.passed}/${totals.exercises}` : '–'} note="Passed" />
            <StatTile value={`${streak} day${streak === 1 ? '' : 's'}`} note="Streak" />
            <StatTile value={`+${totals.xp.toLocaleString()}`} note="XP" />
          </div>
        ) : (
          <div className="progress-row">
            <ProgressBar label="Today's practice" value={minutes.done} max={minutes.planned} accent />
            <span className="num">
              {minutes.done} of {minutes.planned} min
            </span>
          </div>
        )}
        <ol className="plan-list">
          {day.blocks.map((block, i) => {
            const state = blockState(day, i);
            const run = day.runs[i];
            const current = state === 'current';
            return (
              <li key={i} className={current ? undefined : `is-${state}`} aria-current={current ? 'step' : undefined}>
                <StepMark number={i + 1} state={state} />
                <span className="plan-block-name">
                  {LESSONS[block.lesson].name}
                  <span className="visually-hidden">{state === 'done' ? ', done' : state === 'skipped' ? ', skipped' : current ? ', next' : ''}</span>
                </span>
                <span className="plan-block-side num">
                  {run.skipped ? (
                    <button type="button" className="btn btn-sm" onClick={() => props.onRestore(i)} title="Put this block back in today's plan.">
                      Bring back<span className="visually-hidden"> {LESSON_WORDS[block.lesson]}</span>
                    </button>
                  ) : run.done > 0 ? (
                    <Pips done={run.done} total={Math.max(block.exercises, run.done)} />
                  ) : (
                    `${block.minutes} min`
                  )}
                </span>
                <span className="plan-block-why">{state === 'done' || state === 'skipped' ? blockOutcome(block, run) : block.reason}</span>
                {current ? (
                  <div className="plan-go">
                    <button type="button" className="btn btn-primary" onClick={onStart} ref={startRef}>
                      <Icon name="next" />
                      {run.done > 0 ? 'Continue' : 'Start'} {LESSON_WORDS[block.lesson]} <kbd>Enter</kbd>
                    </button>
                    {props.pianoShortcuts ? (
                      <div className="results-shortcuts" role="group" aria-label="Piano shortcuts">
                        <span>Piano:</span>
                        <span>
                          <kbd className="kbd-piano">D</kbd>
                          {run.done > 0 ? 'Continue' : 'Start'}
                        </span>
                      </div>
                    ) : null}
                    <button type="button" className="btn btn-ghost" onClick={props.onSkip}>
                      Skip block
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
        {finished && !empty ? (
          <>
            {dueTomorrow ? (
              <Callout>
                <b>Tomorrow:</b> {dueTomorrow} item{dueTomorrow === 1 ? ' is' : 's are'} due for review.
              </Callout>
            ) : null}
            <div className="plan-actions">
              <button type="button" className="btn" onClick={props.onFreePractice}>
                Go to free practice
              </button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
