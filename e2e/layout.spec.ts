import { expect, test } from './support';

const LESSONS = ['sight', 'ear', 'rhythm', 'scales', 'chords'];

for (const width of [390, 768, 1100, 1440, 1800]) {
  test(`Top bar fits at ${width}px for every lesson`, async ({ app, page }) => {
    await page.setViewportSize({ width, height: 800 });
    await app.open({ settings: { lesson: 'sight' } });
    for (const lesson of LESSONS) {
      const bar = page.locator('.topbar');
      const [scroll, client] = await bar.evaluate((el) => [el.scrollWidth, el.clientWidth]);
      expect(scroll, `${lesson}: top bar overflows`).toBeLessThanOrEqual(client);
      const clipped = await page.locator('.topbar-lesson button').evaluateAll((bs) => bs.some((b) => b.scrollWidth > b.clientWidth + 1));
      expect(clipped, `${lesson}: a lesson label is clipped`).toBe(false);
      const next = LESSONS[LESSONS.indexOf(lesson) + 1];
      if (next) await page.locator('.topbar-lesson [role=radio]').nth(LESSONS.indexOf(next)).click();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test('Key sound toggle above the keys flips the setting and persists', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight', keySound: false } });
  const button = page.locator('.kb-sound');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await app.savedSettings()).keySound).toBe(true);
  await page.reload();
  await expect(page.locator('.kb-sound')).toHaveAttribute('aria-pressed', 'true');
});

test('Every lesson renders its exercise and Progress panels', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight' } });
  for (let i = 0; i < LESSONS.length; i++) {
    await page.locator('.topbar-lesson [role=radio]').nth(i).click();
    await expect(page.locator('.meta-strip')).toBeVisible();
    await app.openTab('Progress');
    await expect(page.locator('.sidebar')).toContainText('XP');
    await app.openTab('Exercise');
  }
});
