import { isNativeApp } from './native';

/**
 * Asking the browser to keep the app's local data (`navigator.storage.persist()`).
 *
 * Chrome, Edge and Safari answer silently from their own heuristics (installed app, engagement);
 * Firefox shows a small permission pop-up. So the app asks only once per session, after a
 * finished exercise, a pause in practice, and never while a page is loading.
 */

let requested = false;

/** Asks once per session; does nothing in the native app or where the API is missing. */
export function requestPersistentStorageOnce(): void {
  if (requested || isNativeApp()) return;
  requested = true;
  const storage = globalThis.navigator?.storage;
  if (!storage?.persist || !storage.persisted) return;
  storage
    .persisted()
    .then((persisted) => persisted || storage.persist())
    .catch(() => {});
}

/** Whether the browser has agreed to keep the data; false where it cannot say. */
export async function isStoragePersisted(): Promise<boolean> {
  try {
    return (await globalThis.navigator?.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

/**
 * An iPad/iPhone browser tab, not a Home Screen app. WebKit deletes script-written storage of a
 * site after 7 days of browser use without a visit; Home Screen apps are exempt but get their own
 * storage, separate from the browser's.
 */
export function isAppleMobileBrowserTab(): boolean {
  if (isNativeApp() || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // iPadOS reports a Mac user agent; touch support tells the two apart.
  const appleMobile = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!appleMobile) return false;
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches;
  return !standalone;
}
