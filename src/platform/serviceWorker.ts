/** Set by the build (pwa/vitePwa.ts): true only for the website's production build. */
declare const __PWA__: boolean;

const HOUR = 60 * 60 * 1000;

/**
 * Registers the offline service worker (pwa/sw.js). Updates are silent: a new deploy is
 * downloaded in the background and used from the next launch; the open page is never reloaded.
 * An installed app can stay open for days, so it also looks for a new version when it comes back
 * to the foreground (at most once an hour).
 */
export function registerServiceWorker(): void {
  if (!__PWA__ || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((registration) => {
        let lastCheck = Date.now();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState !== 'visible' || Date.now() - lastCheck < HOUR) return;
          lastCheck = Date.now();
          registration.update().catch(() => {});
        });
      })
      .catch(() => {
        // No worker (private mode, blocked storage, …): the app still works online.
      });
  });
}
