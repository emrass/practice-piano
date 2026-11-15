import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

/**
 * Installable, offline-capable hosted app: web app manifest, icons, iOS home-screen tags and a
 * service worker (pwa/sw.js) that caches the whole build.
 *
 * Only for the website build. `vite dev` stays without a worker (it would cache dev modules), and
 * the native build (`--mode native`, WKWebView) gets none of it. `__PWA__` tells the app code
 * whether to register the worker.
 */
export function pwa(enabled: boolean): Plugin {
  let config: ResolvedConfig;
  const dir = new URL('.', import.meta.url);

  return {
    name: 'practice-piano-pwa',
    config: () => ({ define: { __PWA__: JSON.stringify(enabled) } }),
    configResolved(c) {
      config = c;
    },
    transformIndexHtml: () =>
      enabled
        ? [
            { tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' },
            { tag: 'link', attrs: { rel: 'apple-touch-icon', href: './icons/apple-touch-icon.png' }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
            // Still needed by iPadOS/iOS before 16.4, which ignore the manifest's `display`.
            { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: 'Practice Piano' }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }, injectTo: 'head' },
          ]
        : [],
    generateBundle() {
      if (!enabled) return;
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(MANIFEST, null, 2) });
      for (const icon of ICONS) {
        this.emitFile({ type: 'asset', fileName: `icons/${icon}`, source: readFileSync(new URL(`icons/${icon}`, dir)) });
      }
    },
    // After the build (and the public folder) is written: precache every file of it.
    closeBundle() {
      if (!enabled) return;
      const outDir = resolve(config.root, config.build.outDir);
      const files = listFiles(outDir)
        .map((f) => relative(outDir, f).split(sep).join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !f.split('/').some((part) => part.startsWith('.')))
        .sort();
      const hash = createHash('sha256');
      for (const f of files) hash.update(f).update('\0').update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const source = readFileSync(new URL('sw.js', dir), 'utf8')
        .replace("'__PP_VERSION__'", JSON.stringify(version))
        .replace('__PP_FILES__', JSON.stringify(files.map((f) => `./${f}`)));
      writeFileSync(join(outDir, 'sw.js'), source);
    },
  };
}

const ICONS = ['icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png'];

// Colors from src/styles/base.css (light theme): --bg for the splash, --paper-2 like the theme-color meta.
const MANIFEST = {
  id: './',
  name: 'Practice Piano',
  short_name: 'Practice Piano',
  description: 'Sight reading, ear training, rhythm and scales practice for your MIDI piano.',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#efe7d7',
  theme_color: '#f5efe3',
  icons: [
    { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]));
}
