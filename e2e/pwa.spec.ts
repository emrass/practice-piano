import { expect, test } from '@playwright/test';
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
  await expect(page.locator('.chip-midi')).toHaveClass(/is-on/);
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
  await page.getByRole('tab', { name: 'Progress' }).click();
  await expect(page.locator('.storage-status')).toContainText(/protected from automatic clean-up|may clear it/);
});
