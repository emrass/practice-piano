import { useMemo } from 'react';
import type { LessonId } from '../../core/lessons';
import { dayKey, displayStreak, recentSummary, type ProgressState } from '../../core/progress/progress';
import { timeStats } from '../../core/progress/rhythm';
import type { Settings } from '../../core/settings';
import { PROGRESS_VIEWS, pct } from '../progress';
import { useStorageRisk } from '../hooks/useStorageRisk';
import { Callout } from './controls';

/**
 * The Progress tab: shared summary tiles and the lesson's own section (see `src/ui/progress/`).
 * Backup, restore and erase apply to the whole app and live in Your data (DataDialog); here only
 * a note points there when the browser may lose the data.
 */
export function ProgressPanel(props: {
  lesson: LessonId;
  progress: ProgressState;
  settings: Settings;
  onPracticeWeakSpots: () => void;
  storageKind: string;
  /** Opens Your data (backup, restore, erase), for the note shown when the data is at risk. */
  onOpenData: () => void;
  now: number;
  /** Review the due items of the current lesson (scales, chords). */
  onReview?: () => void;
}) {
  const { progress } = props;
  const view = PROGRESS_VIEWS[props.lesson];
  const { Section } = view;
  const summary = recentSummary(progress, 20, props.lesson);
  const overallTendency = useMemo(() => {
    const all = timeStats(progress, 'rhythmHand');
    const n = all.reduce((a, t) => a + (t.tendencyMs === null ? 0 : t.attempts), 0);
    return n ? Math.round(all.reduce((a, t) => a + (t.tendencyMs ?? 0) * t.attempts, 0) / n) : null;
  }, [progress]);
  const streak = displayStreak(progress.streak, dayKey(new Date()));
  const { atRisk } = useStorageRisk(props.storageKind);

  return (
    <div className="panel-body">
      <section className="section">
        <div className="stat-tiles">
          <div className="stat stat-tile stat-tile-card stat-sm">
            <span className="stat-value">{progress.xp.toLocaleString()}</span>
            <span className="stat-note">XP</span>
          </div>
          <div className="stat stat-tile stat-tile-card stat-sm">
            <span className="stat-value">{streak}</span>
            <span className="stat-note">Day streak · best {progress.streak.best}</span>
          </div>
          <div className="stat stat-tile stat-tile-card stat-sm">
            <span className="stat-value">{progress.exercisesCompleted}</span>
            <span className="stat-note">Exercises</span>
          </div>
          <div className="stat stat-tile stat-tile-card stat-sm">
            <span className="stat-value">{pct(summary.pitchAccuracy)}</span>
            <span className="stat-note">{view.summary.pitch}</span>
          </div>
          <div className="stat stat-tile stat-tile-card stat-sm">
            <span className="stat-value">{view.summary.second === 'replays' ? summary.replays : pct(summary.timingAccuracy)}</span>
            <span className="stat-note">{view.summary.secondLabel}</span>
          </div>
          {view.summary.third === 'tendency' ? (
            <div className="stat stat-tile stat-tile-card stat-sm" title="Average offset of your hits. Early is rushing, late is dragging.">
              <span className="stat-value">{overallTendency === null ? '–' : Math.abs(overallTendency) < 8 ? '0 ms' : `${Math.abs(overallTendency)} ms`}</span>
              <span className="stat-note">Tendency{overallTendency !== null && Math.abs(overallTendency) >= 8 ? (overallTendency < 0 ? ' · rushes' : ' · drags') : ''}</span>
            </div>
          ) : (
            <div className="stat stat-tile stat-tile-card stat-sm">
              <span className="stat-value">{summary.medianReactionMs === null ? '–' : `${(summary.medianReactionMs / 1000).toFixed(2)} s`}</span>
              <span className="stat-note">Median reaction</span>
            </div>
          )}
        </div>
      </section>

      <Section progress={progress} settings={props.settings} now={props.now} onReview={() => props.onReview?.()} onPracticeWeakSpots={props.onPracticeWeakSpots} />

      {atRisk ? (
        <Callout
          tone="warning"
          action={
            <button type="button" className="btn btn-sm" onClick={props.onOpenData}>
              Your data
            </button>
          }
        >
          {props.storageKind === 'memory'
            ? 'This browser isn’t saving your progress. Back it up in Your data before you leave.'
            : 'This browser can clear your progress after 7 days without a visit. Back it up in Your data.'}
        </Callout>
      ) : null}
    </div>
  );
}
