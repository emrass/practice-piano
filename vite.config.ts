/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Cookieless page-view counts for the hosted app (app.practice-piano.com) only: not in dev,
 * and not in the native build, which runs offline inside the iPad/Mac app.
 */
function webAnalytics(enabled: boolean): Plugin {
  return {
    name: 'web-analytics',
    transformIndexHtml: () =>
      enabled
        ? [
            {
              tag: 'script',
              attrs: {
                type: 'module',
                src: 'https://static.cloudflareinsights.com/beacon.min.js',
                'data-cf-beacon': '{"token": "4d738a3dc5294d8eacb87b000a35ec8e"}',
              },
              injectTo: 'body',
            },
          ]
        : [],
  };
}

// `npm run build` → dist/ for the website.
// `npm run build:native` → bundles straight into the Xcode project's Web folder,
// which the native wrapper serves through its app:// scheme handler.
export default defineConfig(({ mode, command }) => ({
  plugins: [react(), webAnalytics(command === 'build' && mode !== 'native')],
  // Relative asset URLs so the same build works on https:// and inside WKWebView.
  base: './',
  build: {
    outDir: mode === 'native' ? 'native/PracticePiano/Web' : 'dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
}));
