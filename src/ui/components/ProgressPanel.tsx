import { useMemo, useRef, useState } from 'react';
import type { LessonId } from '../../core/lessons';
import { dayKey, displayStreak, recentSummary, timeStats, type ProgressState } from '../../core/progress/progress';
import type { Settings } from '../../core/settings';
import { BackupError } from '../../persistence/profileRepository';
import { PROGRESS_VIEWS, pct } from '../progress';
import { profileRepository } from '../state/useProfile';

/**
 * The Progress tab: shared summary tiles, the lesson's own section (see `src/ui/progress/`), then backup/import/reset.
 */
export function ProgressPanel(props: {
  lesson: LessonId;
  progress: ProgressState;
  settings: Settings;
  onPracticeWeakSpots: () => void;
  onDataReplaced: (settings: Settings, progress: ProgressState) => void;
  storageKind: string;
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
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = async (mode: 'download' | 'copy') => {
    const json = await profileRepository.exportBackup();
    if (mode === 'copy') {
      try {
        await navigator.clipboard.writeText(json);
        setMessage('Backup copied to the clipboard.');
      } catch {
        setMessage('Copy was blocked — use Download instead.');
      }
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `practice-piano-backup-${dayKey(new Date())}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Backup downloaded.');
  };

  const importJson = async (file: File) => {
    try {
      const data = await profileRepository.importBackup(await file.text());
      props.onDataReplaced(data.settings, data.progress);
      setMessage('Backup restored.');
    } catch (err) {
      setMessage(err instanceof BackupError ? err.message : 'Could not read that file.');
    }
  };

  return (
    <div className="panel-body">
      <section className="panel-section">
        <div className="stat-tiles">
          <div className="tile">
            <span className="tile-v">{progress.xp.toLocaleString()}</span>
            <span className="tile-k">XP</span>
          </div>
          <div className="tile">
            <span className="tile-v">{streak}</span>
            <span className="tile-k">Day streak · best {progress.streak.best}</span>
          </div>
          <div className="tile">
            <span className="tile-v">{progress.exercisesCompleted}</span>
            <span className="tile-k">Exercises</span>
          </div>
          <div className="tile">
            <span className="tile-v">{pct(summary.pitchAccuracy)}</span>
            <span className="tile-k">{view.summary.pitch}</span>
          </div>
          <div className="tile">
            <span className="tile-v">{view.summary.second === 'replays' ? summary.replays : pct(summary.timingAccuracy)}</span>
            <span className="tile-k">{view.summary.secondLabel}</span>
          </div>
          {view.summary.third === 'tendency' ? (
            <div className="tile" title="Average offset of your hits: early = rushing, late = dragging">
              <span className="tile-v">{overallTendency === null ? '—' : Math.abs(overallTendency) < 8 ? '±0' : `${overallTendency > 0 ? '+' : '−'}${Math.abs(overallTendency)}`}</span>
              <span className="tile-k">Tendency ms{overallTendency !== null && Math.abs(overallTendency) >= 8 ? (overallTendency < 0 ? ' · rushes' : ' · drags') : ''}</span>
            </div>
          ) : (
            <div className="tile">
              <span className="tile-v">{summary.medianReactionMs === null ? '—' : `${(summary.medianReactionMs / 1000).toFixed(2)}s`}</span>
              <span className="tile-k">Median reaction</span>
            </div>
          )}
        </div>
      </section>

      <Section
        progress={progress}
        settings={props.settings}
        now={props.now}
        onReview={() => props.onReview?.()}
        onPracticeWeakSpots={props.onPracticeWeakSpots}
      />

      <section className="panel-section">
        <div className="section-title">Your data</div>
        <p className="field-hint">
          Saved on this device only ({props.storageKind === 'memory' ? 'temporary — storage unavailable here' : 'browser storage'}). Export a backup to move it to another device.
        </p>
        <div className="button-row">
          <button type="button" className="btn" onClick={() => void exportJson('download')}>
            Export JSON
          </button>
          <button type="button" className="btn" onClick={() => void exportJson('copy')}>
            Copy
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Import…
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.target.value = '';
            }}
          />
        </div>
        {confirmReset ? (
          <div className="button-row">
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                const data = await profileRepository.reset();
                props.onDataReplaced(data.settings, data.progress);
                setConfirmReset(false);
                setMessage('All progress and settings were reset.');
              }}
            >
              Yes, erase everything
            </button>
            <button type="button" className="btn" onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="btn btn-ghost-danger" onClick={() => setConfirmReset(true)}>
            Reset progress…
          </button>
        )}
        {message ? <p className="status-line is-ok">{message}</p> : null}
      </section>
    </div>
  );
}
