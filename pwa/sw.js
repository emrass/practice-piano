/**
 * Service worker for the hosted web app (not the native build). The build plugin
 * (pwa/vitePwa.ts) replaces the two placeholders below with the build's file list and a hash of
 * its contents, so every deploy that changes a file produces a new worker.
 *
 * - install: download every file of the build into a cache named after that hash.
 * - fetch, page navigations: network first, so a launch after a deploy opens the new version.
 *   The page is revalidated past the HTTP cache (GitHub Pages sends max-age=600). Offline, on an
 *   error status or after NETWORK_TIMEOUT_MS the cached index.html answers instead. The fresh
 *   page is not cached: the cache only ever holds one complete build.
 * - fetch, everything else: cache first (the build's files are content-hashed), falling back to
 *   the network. That also serves a fresh index.html whose files the old cache doesn't have yet.
 * - update: the browser re-checks this file on each visit, and src/platform/serviceWorker.ts asks
 *   again whenever the app comes back to the foreground. A new worker installs in the background
 *   and takes over right away (skipWaiting); the page reloads itself into the new version once
 *   no exercise is under way. That is safe because the app is a single bundle with no lazily
 *   loaded chunks. If code splitting is ever added, keep the previous build's cache until no
 *   page uses it.
 */

const VERSION = '__PP_VERSION__';
const FILES = /** @type {string[]} */ (__PP_FILES__);
const CACHE = `practice-piano-${VERSION}`;
const INDEX = new URL('./index.html', self.location.href).href;
/** How long a launch waits for the network before it opens the cached page (as Workbox's pageCache). */
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // `reload`: skip the HTTP cache, which could still hold the previous index.html.
      await cache.addAll(FILES.map((f) => new Request(new URL(f, self.location.href), { cache: 'reload' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('practice-piano-') && n !== CACHE).map((n) => caches.delete(n)));
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(request.mode === 'navigate' ? page(request) : file(request));
});

/** The app's page: the deployed one if the network answers in time, else the cached build's. */
async function page(request) {
  // `no-cache`: revalidate with the server (a cheap 304 when nothing changed) instead of taking
  // a copy from the HTTP cache that could predate the last deploy.
  const network = fetch(request, { cache: 'no-cache' }).then(
    (response) => (response.ok || response.type === 'opaqueredirect' ? response : undefined),
    () => undefined,
  );
  const timeout = new Promise((resolve) => setTimeout(resolve, NETWORK_TIMEOUT_MS));
  const fresh = await Promise.race([network, timeout]);
  if (fresh) return fresh;
  const cached = await (await caches.open(CACHE)).match(INDEX, { ignoreSearch: true });
  return cached ?? (await network) ?? Response.error();
}

async function file(request) {
  const cache = await caches.open(CACHE);
  // ignoreVary: the cached copies were fetched without the Origin header that module scripts send.
  const hit = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
  return hit ?? fetch(request);
}
