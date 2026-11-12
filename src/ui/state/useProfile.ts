import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyProgress, type ProgressState } from '../../core/progress/progress';
import { DEFAULT_SETTINGS, type Settings } from '../../core/settings';
import { LocalIdentityProvider } from '../../persistence/identity';
import { ProfileRepository } from '../../persistence/profileRepository';
import { createDefaultStorage } from '../../persistence/storage';

const storage = createDefaultStorage();
export const profileRepository = new ProfileRepository(storage, new LocalIdentityProvider(storage));

export interface Profile {
  ready: boolean;
  settings: Settings;
  progress: ProgressState;
  storageKind: string;
  updateSettings: (patch: Partial<Settings>) => void;
  setProgress: (progress: ProgressState) => void;
  replaceAll: (settings: Settings, progress: ProgressState) => void;
}

/** Loads the local profile and persists changes (debounced). */
export function useProfile(): Profile {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [progress, setProgressState] = useState<ProgressState>(emptyProgress);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(settings);

  useEffect(() => {
    let cancelled = false;
    profileRepository.load().then((data) => {
      if (cancelled) return;
      latest.current = data.settings;
      setSettings(data.settings);
      setProgressState(data.progress);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      latest.current = next;
      return next;
    });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void profileRepository.saveSettings(latest.current), 300);
  }, []);

  const setProgress = useCallback((p: ProgressState) => {
    setProgressState(p);
    void profileRepository.saveProgress(p);
  }, []);

  const replaceAll = useCallback((s: Settings, p: ProgressState) => {
    latest.current = s;
    setSettings(s);
    setProgressState(p);
  }, []);

  useEffect(() => {
    const flush = () => void profileRepository.saveSettings(latest.current);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  return { ready, settings, progress, storageKind: profileRepository.storageKind, updateSettings, setProgress, replaceAll };
}
