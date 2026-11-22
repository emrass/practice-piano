import { useEffect, useRef, useState } from 'react';
import { dayKey, type ProgressState } from '../../core/progress/progress';
import type { Settings } from '../../core/settings';
import { BackupError, readBackup, type ProfileData } from '../../persistence/profileRepository';
import { nativePlatform, saveFileNatively } from '../../platform/native';
import { isAppleMobileBrowserTab } from '../../platform/storageProtection';
import { useStorageRisk } from '../hooks/useStorageRisk';
import { profileRepository } from '../state/useProfile';
import { Callout, Field } from './controls';
import { Dialog } from './Dialog';

/** A confirmation takes the dialog over, its question as the title. */
const TITLES = { main: 'Your data', restore: 'Replace everything with this backup?', erase: 'Erase all progress and settings?' } as const;

type View = { step: 'main' } | { step: 'restore'; data: ProfileData; exportedAt: Date | null } | { step: 'erase' };

/**
 * Your data: backup, restore and erase for the whole profile (every lesson's progress and all
 * settings). Opened from the top bar, never from a lesson, so its scope is the app's. Restoring
 * and erasing each confirm in place of the dialog's content (design/system/components/Dialog).
 */
export function DataDialog(props: {
  storageKind: string;
  onDataReplaced: (settings: Settings, progress: ProgressState) => void;
  /** After an erase the app starts over (the setup guide opens), so this dialog closes. */
  onErased: () => void;
  onClose: () => void;
}) {
  const { onClose } = props;
  const [view, setView] = useState<View>({ step: 'main' });
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const exportJson = async (mode: 'download' | 'copy') => {
    const json = await profileRepository.exportBackup();
    if (mode === 'copy') {
      try {
        await navigator.clipboard.writeText(json);
        setMessage('Backup copied to the clipboard.');
      } catch {
        setMessage('Copy was blocked. Use Export file instead.');
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

  /** Reads and checks the file; nothing changes until the person confirms. */
  const pickBackup = async (file: File) => {
    try {
      const { data, exportedAt } = readBackup(await file.text());
      setMessage(null);
      setView({ step: 'restore', data, exportedAt });
    } catch (err) {
      setMessage(err instanceof BackupError ? err.message : 'Could not read that file.');
    }
  };

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="application/json,.json"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void pickBackup(f);
        e.target.value = '';
      }}
    />
  );

  const feedback = message ? <Callout live>{message}</Callout> : null;

  return (
    <Dialog title={TITLES[view.step]} closeLabel="Close Your data" onClose={onClose} dismissible sheet className="data-dialog">
      {view.step === 'main' ? (
        <div className="dialog-body">
          <p>Your progress in every lesson and all your settings.</p>
          <StorageStatus storageKind={props.storageKind} />
          <Field label="Back up" hint="Keep the file somewhere safe, or import it on another device.">
            <div className="button-row">
              <button type="button" className="btn" onClick={() => void exportJson('download')}>
                Export file
              </button>
              <button type="button" className="btn" onClick={() => void exportJson('copy')}>
                Copy
              </button>
            </div>
          </Field>
          <Field label="Restore from a backup" hint="Replaces everything on this device with the backup. You confirm first.">
            <div className="button-row">
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                Import
              </button>
              {fileInput}
            </div>
          </Field>
          <div>
            <button
              type="button"
              className="btn btn-ghost btn-danger-text"
              onClick={() => {
                setMessage(null);
                setView({ step: 'erase' });
              }}
            >
              Erase everything
            </button>
          </div>
          {feedback}
        </div>
      ) : null}

      {view.step === 'restore' ? (
        <>
          <div className="dialog-body">
            <p>
              Your progress in every lesson and all settings on this device will be replaced by the backup
              {view.exportedAt ? ` from ${formatDate(view.exportedAt)}` : ''}.
            </p>
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setView({ step: 'main' })}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                const data = await profileRepository.restore(view.data);
                props.onDataReplaced(data.settings, data.progress);
                setView({ step: 'main' });
                setMessage('Backup restored.');
              }}
            >
              Replace everything
            </button>
          </div>
        </>
      ) : null}

      {view.step === 'erase' ? (
        <>
          <div className="dialog-body">
            <p>This erases your progress in every lesson, your XP and streak, and all settings on this device. It can’t be undone.</p>
            <div className="button-row">
              <button type="button" className="btn" onClick={() => void exportJson('download')}>
                Export a backup first
              </button>
            </div>
            {feedback}
          </div>
          <div className="dialog-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setMessage(null);
                setView({ step: 'main' });
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={async () => {
                const data = await profileRepository.reset();
                props.onDataReplaced(data.settings, data.progress);
                props.onErased();
              }}
            >
              Erase everything
            </button>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Where the data lives and whether the browser may clear it (see platform/storageProtection). */
function StorageStatus({ storageKind }: { storageKind: string }) {
  const { web, persisted } = useStorageRisk(storageKind);

  if (!web) {
    return (
      <p className="field-hint storage-status">
        Saved on this device only ({storageKind === 'memory' ? 'temporary: storage is unavailable here' : 'browser storage'}). Export a backup to move it to another device.
      </p>
    );
  }
  if (isAppleMobileBrowserTab()) {
    return (
      <p className="field-hint storage-status">
        Saved in this browser on this device. On iPad and iPhone, a browser can delete it after 7 days without a visit. To keep it, add the app to your Home Screen (Share → Add to
        Home Screen). The Home Screen app starts empty: use Export file here, then Import there.
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
