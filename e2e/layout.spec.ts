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

// The longest status messages (ear's prompt, Flow's start hint) must show in full: the bar
// wraps the message, then gives it a row of its own, rather than cutting it off.
const LONGEST = 'Play it back — find the first note from the key';
for (const width of [390, 820, 1024, 1180, 1280, 1440]) {
  for (const mode of ['wait', 'flow'] as const) {
    test(`Practice bar message is never clipped at ${width}px (${mode})`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 860 });
      await app.open({ settings: { lesson: 'sight', sight: { mode } } });
      const message = page.locator('.pb-message');
      await message.evaluate((el, text) => (el.textContent = text), LONGEST);
      const cut = await message.evaluate((el) => el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
      expect(cut, 'message is cut off').toBe(false);
      const stats = await page.locator('.pb-stats div').evaluateAll((ds) => ds.some((d) => d.scrollWidth > d.clientWidth + 1));
      expect(stats, 'a stat label overflows its column').toBe(false);
    });
  }
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
