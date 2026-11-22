import { useEffect, useState } from 'react';
import { isNativeApp } from '../../platform/native';
import { isAppleMobileBrowserTab, isStoragePersisted } from '../../platform/storageProtection';

/**
 * Where the data is kept and whether the browser may clear it: `persisted` is null until the
 * browser answers. `atRisk` is a real chance of losing it (storage unavailable, or an
 * iPad/iPhone browser tab, which WebKit clears after 7 days without a visit).
 */
export function useStorageRisk(storageKind: string): { web: boolean; persisted: boolean | null; atRisk: boolean } {
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
  return { web, persisted, atRisk: storageKind === 'memory' || (web && isAppleMobileBrowserTab()) };
}
