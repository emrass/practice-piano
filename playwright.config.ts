import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests: the real app in Chromium, played through a fake Web MIDI piano
 * (e2e/support.ts). `npm run e2e` starts the dev server on its own port, and builds and serves
 * a production build for the installable/offline tests (e2e/pwa.spec.ts, project `pwa`).
 *
 * PLAYWRIGHT_CHROMIUM_PATH points at an installed Chromium where `npx playwright install`
 * cannot download one (for example a sandbox without access to the browser CDN).
 */
const PORT = 5179;
const PREVIEW_PORT = 5180;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 45_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    trace: 'retain-on-failure',
    launchOptions: { executablePath, args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [
    { name: 'chromium', testIgnore: 'pwa.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    {
      name: 'pwa',
      testMatch: 'pwa.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, baseURL: `http://127.0.0.1:${PREVIEW_PORT}/` },
    },
  ],
  webServer: [
    {
      command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // Its own output folder, so it never overwrites dist/.
      command: `npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port ${PREVIEW_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${PREVIEW_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
