import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { fakeMidi, skipSetup } from './support';

/**
 * The installable, offline web app. Runs against a production build served by `vite preview`
 * (the `pwa` project in playwright.config.ts): the dev server has no service worker.
 */

test('The manifest and its icons are served', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel=manifest]').getAttribute('href');
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: 'Practice Piano', display: 'standalone', start_url: './' });
  expect(manifest.icons.map((i: { purpose: string }) => i.purpose)).toEqual(expect.arrayContaining(['any', 'maskable']));
  for (const icon of [...manifest.icons.map((i: { src: string }) => i.src), 'icons/apple-touch-icon.png']) {
    const res = await request.get(icon);
    expect(res.ok(), icon).toBe(true);
    expect(res.headers()['content-type']).toBe('image/png');
  }
});

test('After one visit, the app loads and plays offline', async ({ page, context }) => {
  await page.addInitScript(fakeMidi);
  await page.goto('./');
  await skipSetup(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.topbar')).toBeVisible();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  // MIDI input reaches the keyboard.
  await expect(page.locator('.chip-midi .status-dot')).toHaveClass(/is-on/);
  const key = page.locator('[data-midi="60"]');
  await page.evaluate(() => window.__midi([0x90, 60, 72]));
  await expect(key).toHaveClass(/is-held/);
  await page.evaluate(() => window.__midi([0x80, 60, 0]));
  await expect(key).not.toHaveClass(/is-held/);

  // So do the on-screen keys.
  const box = (await key.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 10);
  await page.mouse.down();
  await expect(key).toHaveClass(/is-held/);
  await page.mouse.up();
});

test('Your data shows whether the browser keeps the data', async ({ page }) => {
  await page.goto('./');
  await skipSetup(page);
  await page.getByRole('button', { name: 'Your data' }).click();
  await expect(page.getByRole('dialog', { name: 'Your data' }).locator('.storage-status')).toContainText(/protected from automatic clean-up|may clear it/);
});

// ---- Updates ----------------------------------------------------------------------------
// Two production builds (playwright.config.ts): dist-e2e and dist-e2e-next, the same app with a
// marker in its script (e2e/next-build.config.ts). Each test serves them from its own server and
// "deploys" the next one, with GitHub Pages' caching header.

const BUILDS = { current: 'dist-e2e', next: 'dist-e2e-next' };
const NEXT_CACHE = `practice-piano-${/VERSION = "(\w+)"/.exec(readFileSync(join(BUILDS.next, 'sw.js'), 'utf8'))![1]}`;
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

interface Deploys {
  url: string;
  deploy(build: keyof typeof BUILDS): void;
  /** Delays the page itself (`/`, what a launch loads), as on a very slow connection. */
  pageDelayMs: number;
}

const updates = test.extend<{ deploys: Deploys }>({
  deploys: async ({ context }, use) => {
    let build: keyof typeof BUILDS = 'current';
    const deploys: Deploys = { url: '', deploy: (b) => (build = b), pageDelayMs: 0 };
    const server = createServer(async (req, res) => {
      const pathname = new URL(req.url!, 'http://localhost').pathname;
      if (pathname === '/' && deploys.pageDelayMs) await new Promise((r) => setTimeout(r, deploys.pageDelayMs));
      const file = normalize(pathname.endsWith('/') ? `${pathname}index.html` : pathname).replace(/^([/\\]|\.\.)+/, '');
      try {
        const body = await readFile(join(BUILDS[build], file));
        res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'max-age=600' });
        res.end(body);
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    deploys.url = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/`;
    await context.addInitScript(fakeMidi);
    // The page view beacon of the hosted build: not part of these tests.
    await context.route('https://static.cloudflareinsights.com/**', (route) => route.abort());
    await use(deploys);
    server.close();
  },
});

/** First visit: skip the setup guide and wait until the worker has cached the build. */
async function firstVisit(context: BrowserContext, deploys: Deploys): Promise<Page> {
  const page = await context.newPage();
  await page.goto(deploys.url);
  await skipSetup(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  return page;
}

const runsNextBuild = (page: Page) => page.evaluate(() => '__ppNextBuild' in globalThis);

/** The app goes to the background and comes back (the OS resumes it, the tab is shown again). */
async function leaveAndReturn(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const state of ['hidden', 'visible']) {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      document.dispatchEvent(new Event('visibilitychange'));
    }
  });
}

/** Leaves the app and returns, and waits until the next build's worker has taken over. */
async function returnAfterDeploy(page: Page): Promise<void> {
  await leaveAndReturn(page);
  await expect.poll(() => page.evaluate(() => caches.keys()).catch(() => []), { timeout: 15_000 }).toEqual([NEXT_CACHE]);
}

updates('A launch after a deploy opens the new version', async ({ context, deploys }) => {
  await (await firstVisit(context, deploys)).close();
  deploys.deploy('next');

  const page = await context.newPage();
  await page.goto(deploys.url);
  expect(await runsNextBuild(page)).toBe(true);
  await expect(page.locator('.topbar')).toBeVisible();

  // It already runs the new files: once the new worker takes over, nothing reloads.
  await page.evaluate(() => Object.assign(window, { __ppNoReload: true }));
  await returnAfterDeploy(page);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => '__ppNoReload' in window)).toBe(true);
});

updates('An app that comes back to the foreground reloads into the new version when idle', async ({ context, deploys }) => {
  const page = await firstVisit(context, deploys);
  await page.reload();
  deploys.deploy('next');

  const reloaded = page.waitForEvent('framenavigated', { timeout: 15_000 });
  await leaveAndReturn(page);
  await reloaded;
  await expect(page.locator('.topbar')).toBeVisible();
  expect(await runsNextBuild(page)).toBe(true);
  // Settings survive: the setup guide stays dismissed.
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

updates('A run under way is never cut short; the update waits for the next return', async ({ context, deploys }) => {
  const page = await firstVisit(context, deploys);
  await page.reload();
  await expect(page.locator('.chip-midi .status-dot')).toHaveClass(/is-on/);

  // Play into the Wait run: now there is something to lose.
  await page.evaluate(() => window.__midi([0x90, 60, 72]));
  await page.evaluate(() => window.__midi([0x80, 60, 0]));
  const restart = page.locator('.practice-bar').getByRole('button', { name: 'Restart' });
  await expect(restart).toBeEnabled();

  deploys.deploy('next');
  await page.evaluate(() => Object.assign(window, { __ppNoReload: true }));
  await returnAfterDeploy(page);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => '__ppNoReload' in window)).toBe(true);
  expect(await runsNextBuild(page)).toBe(false);

  // The run is over (restarted, nothing played): the next return brings the new version.
  await restart.click();
  await expect(restart).toBeDisabled();
  const reloaded = page.waitForEvent('framenavigated', { timeout: 15_000 });
  await leaveAndReturn(page);
  await reloaded;
  await expect(page.locator('.topbar')).toBeVisible();
  expect(await runsNextBuild(page)).toBe(true);
});

updates('On a very slow connection a launch opens the cached version, then updates', async ({ context, deploys }) => {
  await (await firstVisit(context, deploys)).close();
  deploys.deploy('next');
  deploys.pageDelayMs = 10_000;

  const page = await context.newPage();
  const start = Date.now();
  await page.goto(deploys.url, { waitUntil: 'commit' });
  expect(Date.now() - start).toBeLessThan(deploys.pageDelayMs);
  // The new worker installs meanwhile and the idle page reloads into it (again from the cache).
  await expect.poll(() => runsNextBuild(page).catch(() => false), { timeout: 30_000 }).toBe(true);
  await expect(page.locator('.topbar')).toBeVisible();
});
