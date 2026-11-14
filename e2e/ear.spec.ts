import { expect, test, wrongKey } from './support';

test('Ear training: listen, play the phrase back, notes appear as they are found', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'ear', ear: { level: 15 } } });
  const total = await app.exercise((ex) => (ex.ear as { totalMs: number }).totalMs);
  await page.keyboard.press('Space');
  await page.waitForTimeout(total + 300);
  const steps = await app.steps();
  await app.tap(steps[0]);
  await app.tap([wrongKey(steps[1])]);
  for (const s of steps.slice(1)) await app.tap(s);
  await expect(app.results()).toBeVisible();
  // D on the piano: next phrase (once the shortcuts arm, shortly after the end).
  await expect(async () => {
    await app.tap([62]);
    await expect(app.results()).toBeHidden({ timeout: 300 });
  }).toPass({ timeout: 5000 });
  expect(await app.status()).not.toBe('finished');
});

test('Ear training: a hint shows on the keys with the keyboard guide off', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'ear', showKeyboardGuide: false, ear: { level: 15, reference: 'key-only' } } });
  const total = await app.exercise((ex) => (ex.ear as { totalMs: number }).totalMs);
  await page.keyboard.press('Space');
  await page.waitForTimeout(total + 300);
  const [first] = await app.steps();
  await expect(page.locator('.key.is-expected')).toHaveCount(0);
  await page.keyboard.press('Slash');
  await expect(page.locator('.key.is-expected')).toHaveCount(first.length);
  for (const k of first) await expect(page.locator(`.key[data-midi="${k}"]`)).toHaveClass(/is-expected/);
});

test('Ear training: opening the lesson waits for Listen; asking for a new phrase plays it', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'ear', ear: { level: 15 } } });
  // Unlock audio with a first listen, then leave the lesson and come back.
  await page.keyboard.press('Space');
  await expect.poll(() => app.status()).toBe('running');
  await app.switchLesson(/sight/i);
  await app.switchLesson(/ear/i);
  await page.waitForTimeout(800);
  expect(await app.status()).toBe('ready');
  // An explicit request for a new phrase plays it right away.
  await page.keyboard.press('KeyN');
  await expect.poll(() => app.status()).toBe('running');
});
