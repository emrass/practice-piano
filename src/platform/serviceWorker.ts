/** Set by the build (pwa/vitePwa.ts): true only for the website's production build. */
declare const __PWA__: boolean;

const MINUTE = 60 * 1000;

let canReload: () => boolean = () => true;

/**
 * Tells the updater when a reload would lose nothing (the app: no run under way, no dialog open).
 * Returns a function that removes the check again.
 */
export function setReloadGuard(check: () => boolean): () => void {
  canReload = check;
  return () => {
    if (canReload === check) canReload = () => true;
  };
}

/**
 * Registers the offline service worker (pwa/sw.js) and keeps the page on the deployed version.
 *
 * - A launch already opens the latest deploy: the worker loads the page network-first.
 * - An open app, or one the OS resumes (iPad Home Screen, installed desktop app), looks for a new
 *   version whenever it comes back to the foreground (at most once a minute).
 * - When a new worker takes over and this page runs other files than the new build, the page
 *   reloads into the new version, but only while it is visible and the reload guard says nothing
 *   would be lost. Otherwise the reload waits for the next return to the foreground.
 */
export function registerServiceWorker(): void {
  if (!__PWA__ || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  let outdated = false;
  const reloadIfIdle = () => {
    if (outdated && document.visibilityState === 'visible' && canReload()) window.location.reload();
  };

  // Not on the first visit: sw.js doesn't claim pages it didn't load, so there is no change then.
  sw.addEventListener('controllerchange', () => {
    void runsOutdatedFiles().then((stale) => {
      outdated ||= stale;
      reloadIfIdle();
    });
  });

  window.addEventListener('load', () => {
    sw.register('./sw.js', { scope: './' })
      .then((registration) => {
        let lastCheck = 0;
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible') return;
          reloadIfIdle();
          if (Date.now() - lastCheck < MINUTE) return;
          lastCheck = Date.now();
          registration.update().catch(() => {});
        });
      })
      .catch(() => {
        // No worker (private mode, blocked storage, …): the app still works online.
      });
  });
}

/**
 * Whether this page was loaded from another build than the one the active worker serves. A launch
 * that got the new page from the network already runs the new files and needs no reload.
 */
async function runsOutdatedFiles(): Promise<boolean> {
  try {
    // Answered by the new worker, from the build it just cached.
    const response = await fetch('./index.html');
    if (!response.ok) return false;
    const latest = new DOMParser().parseFromString(await response.text(), 'text/html');
    return appFiles(latest) !== appFiles(document);
  } catch {
    return false;
  }
}

/**
 * The build's own scripts and stylesheets a page loads, as written in index.html. Their names are
 * content-hashed, so they differ between builds exactly when the app's code or styles do.
 * Scripts from other sites (analytics) are left out.
 */
export function appFiles(doc: ParentNode): string {
  const urls = [...doc.querySelectorAll('script[src], link[rel="stylesheet"][href]')]
    .map((el) => el.getAttribute('src') ?? el.getAttribute('href') ?? '')
    .filter((url) => url && !/^([a-z][a-z\d+.-]*:|\/\/)/i.test(url));
  return urls.sort().join('\n');
}
