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

for (const width of [360, 390, 1440]) {
  test(`Results card and piano-shortcut labels fit at ${width}px`, async ({ app, page }) => {
    await page.setViewportSize({ width, height: 800 });
    await app.open({ settings: { lesson: 'sight', pianoShortcuts: true, sight: { mode: 'wait', level: 3, bars: 4, hands: 'rh' } } });
    await app.playSteps();
    const card = page.locator('.results-card');
    await expect(card).toBeVisible();
    expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'results card overflows sideways').toBe(true);
    const box = await card.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const labels = await page.locator('.key-action').evaluateAll((ls) => ls.map((l) => l.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right, t: r.top, b: r.bottom })));
    expect(labels).toHaveLength(5);
    const overlaps = labels.some((a, i) => labels.slice(i + 1).some((b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1));
    expect(overlaps, 'two shortcut labels overlap').toBe(false);
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

test('Keyboard guide button above the keys flips the setting, persists and lights the keys', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight', showKeyboardGuide: true, sight: { mode: 'wait', level: 8, hands: 'rh' } } });
  const guide = page.locator('.kb-guide');
  await expect(guide).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.key.is-expected')).not.toHaveCount(0);
  await guide.click();
  await expect(guide).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.key.is-expected')).toHaveCount(0);
  await expect.poll(async () => (await app.savedSettings()).showKeyboardGuide).toBe(false);
  await page.reload();
  await expect(page.locator('.kb-guide')).toHaveAttribute('aria-pressed', 'false');
});

test('The keyboard guide is greyed out, with the reason, where it would give the answer away', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'ear', showKeyboardGuide: true } });
  const guide = page.locator('.kb-guide');
  await expect(guide).toHaveAttribute('aria-disabled', 'true');
  await expect(guide).toHaveAttribute('aria-pressed', 'false');
  await expect(guide).toHaveAttribute('title', /never shows the answer/);
  await guide.click({ force: true }); // aria-disabled: a click does nothing
  await expect(guide).toHaveAttribute('aria-pressed', 'false');
  expect((await app.savedSettings()).showKeyboardGuide).toBe(true); // the preference is kept for the other lessons
  await page.locator('.topbar-lesson [role=radio]').nth(LESSONS.indexOf('chords')).click();
  await expect(guide).toHaveAttribute('aria-disabled', 'true'); // chord drill (default)
  await page.locator('.topbar-lesson [role=radio]').nth(LESSONS.indexOf('sight')).click();
  await expect(guide).not.toHaveAttribute('aria-disabled', 'true');
  await expect(guide).toHaveAttribute('aria-pressed', 'true');
});

for (const width of [390, 1440]) {
  test(`Keyboard display menu fits at ${width}px and switches names, hints and view`, async ({ app, page }) => {
    await page.setViewportSize({ width, height: 800 });
    await app.open({ settings: { lesson: 'sight', showKeyNames: true, showQwertyHints: false, keyboardView: 'fit' } });
    const head = page.locator('.keyboard-head');
    expect(await head.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'keyboard bar overflows').toBe(true);
    await page.getByRole('button', { name: 'Keyboard display' }).click();
    const menu = page.getByRole('dialog', { name: 'Keyboard display' });
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y).toBeGreaterThanOrEqual(0);
    await expect(page.locator('.key-label', { hasText: /^D$/ }).first()).toBeVisible();
    await menu.getByRole('switch').nth(0).click(); // note names on the keys
    await expect(page.locator('.key-label', { hasText: /^D$/ })).toHaveCount(0);
    await menu.getByRole('switch').nth(1).click(); // computer-key hints
    await expect(page.locator('.key-qwerty').first()).toBeVisible();
    const keys = await page.locator('.key').count();
    await menu.getByRole('radio', { name: 'Full keyboard' }).click();
    await expect.poll(() => page.locator('.key').count()).toBeGreaterThan(keys);
    await expect.poll(async () => app.savedSettings()).toMatchObject({ showKeyNames: false, showQwertyHints: true, keyboardView: 'full' });
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await page.getByRole('button', { name: 'Keyboard display' }).click();
    await page.locator('.meta-strip').click();
    await expect(menu).toBeHidden();
  });
}

test('Rhythm greys out computer-key hints (it uses J and F)', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'rhythm', showQwertyHints: true } });
  await page.getByRole('button', { name: 'Keyboard display' }).click();
  const menu = page.getByRole('dialog', { name: 'Keyboard display' });
  await expect(menu.getByRole('switch').nth(1)).toBeDisabled();
  await expect(menu).toContainText('Rhythm uses J and F');
  await expect(page.locator('.key-qwerty')).toHaveCount(0);
});

test('Your keyboard size is set under Input & audio', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight', keyboardSize: 88 } });
  await app.openTab('Input & audio');
  await page.getByLabel('Your keyboard').selectOption({ index: 0 });
  await expect.poll(async () => (await app.savedSettings()).keyboardSize).not.toBe(88);
  await app.openTab('Exercise');
  await expect(page.locator('.sidebar')).not.toContainText('Keyboard guide');
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
