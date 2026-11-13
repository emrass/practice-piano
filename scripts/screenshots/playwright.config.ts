import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

/**
 * Landing-page screenshots (`npm run screenshots`): stages each shot in the real app through the
 * fake MIDI piano of the browser tests and writes the final .webp files for the site repository.
 *
 *   SCREENSHOT_OUT            output folder (default ../practice-piano-site/img, the site repo next to this one)
 *   PLAYWRIGHT_CHROMIUM_PATH  an installed Chromium, where `npx playwright install` cannot download one
 *
 * One shot (or group): `npm run screenshots -- -g sight-flow`.
 */
const PORT = 5194;
const REPO = fileURLToPath(new URL('../..', import.meta.url));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  outputDir: '../../test-results/screenshots',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 90_000,
  use: {
    baseURL: process.env.SCREENSHOT_BASE_URL || `http://127.0.0.1:${PORT}/`,
    launchOptions: { executablePath, args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } }],
  webServer: process.env.SCREENSHOT_BASE_URL
    ? undefined
    : {
        cwd: REPO,
        command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
        url: `http://127.0.0.1:${PORT}/`,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
