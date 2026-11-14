/**
 * Service worker for the hosted web app (not the native build). The build plugin
 * (pwa/vitePwa.ts) replaces the two placeholders below with the build's file list and a hash of
 * its contents, so every deploy that changes a file produces a new worker.
 *
 * - install: download every file of the build into a cache named after that hash.
 * - fetch: answer same-origin GETs from the cache (page navigations get the cached index.html),
 *   falling back to the network. Nothing is cached at runtime, so the cache only ever holds
 *   one build.
 * - update: the browser re-checks this file on each visit. A new worker installs in the
 *   background and takes over right away (skipWaiting) without reloading the open page; the
 *   page keeps running the code it already loaded, and the next launch starts the new version.
 *   That is safe because the app is a single bundle with no lazily loaded chunks. If code
 *   splitting is ever added, keep the previous build's cache until no page uses it.
 */

const VERSION = '__PP_VERSION__';
const FILES = /** @type {string[]} */ (__PP_FILES__);
const CACHE = `practice-piano-${VERSION}`;
const INDEX = new URL('./index.html', self.location.href).href;

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
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // ignoreVary: the cached copies were fetched without the Origin header that module scripts send.
      const hit = await cache.match(request.mode === 'navigate' ? INDEX : request, { ignoreSearch: true, ignoreVary: true });
      return hit ?? fetch(request);
    })(),
  );
});
