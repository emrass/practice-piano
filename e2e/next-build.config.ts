import { defineConfig, mergeConfig } from 'vite';
import app from '../vite.config.ts';

/**
 * The app's production build with one harmless line added to its script, so it gets new file
 * names and a new service worker: the "next deploy" that e2e/pwa.spec.ts updates to.
 */
export default defineConfig((env) =>
  mergeConfig(typeof app === 'function' ? app(env) : app, {
    plugins: [
      {
        name: 'e2e-next-build',
        renderChunk: (code: string, chunk: { isEntry: boolean }) => (chunk.isEntry ? `${code}\nglobalThis.__ppNextBuild = true;\n` : null),
      },
    ],
  }),
);
