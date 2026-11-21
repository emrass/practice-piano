import { useEffect, useMemo, useRef, useState } from 'react';
import type { LessonId } from '../../core/lessons';
import { dayKey, displayStreak, recentSummary, type ProgressState } from '../../core/progress/progress';
import { timeStats } from '../../core/progress/rhythm';
import type { Settings } from '../../core/settings';
import { BackupError } from '../../persistence/profileRepository';
import { isNativeApp, nativePlatform, saveFileNatively } from '../../platform/native';
import { isAppleMobileBrowserTab, isStoragePersisted } from '../../platform/storageProtection';
import { PROGRESS_VIEWS, pct } from '../progress';
import { profileRepository } from '../state/useProfile';
import { Callout } from './controls';

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
        setMessage('Copy was blocked. Use Export JSON instead.');
      }
      return;
    }
    const name = `practice-piano-backup-${dayKey(new Date())}.json`;
    if (nativePlatform() === 'android') {
      // A WebView has no downloads: the app saves the file where the person picks.
      const status = await saveFileNatively(name, 'application/json', json);
      if (status !== 'canceled') setMessage(status === 'saved' ? 'Backup saved.' : 'The backup could not be saved. Try Copy instead.');
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
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

      <section className="section">
        <div className="section-title">Your data</div>
        <StorageStatus storageKind={props.storageKind} />
        <div className="button-row">
          <button type="button" className="btn" onClick={() => void exportJson('download')}>
            Export JSON
          </button>
          <button type="button" className="btn" onClick={() => void exportJson('copy')}>
            Copy
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Import
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
          <button type="button" className="btn btn-ghost btn-danger-text" onClick={() => setConfirmReset(true)}>
            Reset progress
          </button>
        )}
        {message ? <Callout>{message}</Callout> : null}
      </section>
    </div>
  );
}

/** Where the data lives and whether the browser may clear it (see platform/storageProtection). */
function StorageStatus({ storageKind }: { storageKind: string }) {
  const web = storageKind !== 'memory' && !isNativeApp();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => {
    if (!web) return;
    let canceled = false;
    void isStoragePersisted().then((p) => {
      if (!canceled) setPersisted(p);
    });
    return () => {
      canceled = true;
    };
  }, [web]);

  if (!web) {
    return (
      <p className="field-hint">
        Saved on this device only ({storageKind === 'memory' ? 'temporary: storage is unavailable here' : 'browser storage'}). Export a backup to move it to another device.
      </p>
    );
  }
  if (isAppleMobileBrowserTab()) {
    return (
      <p className="field-hint storage-status">
        Saved in this browser on this device. On iPad and iPhone, a browser can delete it after 7 days without a visit. To keep it, add the app to your Home Screen (Share → Add to
        Home Screen). The Home Screen app starts empty: use Export JSON here, then Import there.
      </p>
    );
  }
  return (
    <p className="field-hint storage-status">
      {persisted === null
        ? 'Saved on this device.'
        : persisted
          ? 'Saved on this device and protected from automatic cleanup.'
          : 'Saved on this device. The browser may clear it if the device runs low on space.'}{' '}
      Export a backup to move it to another device.
    </p>
  );
}
