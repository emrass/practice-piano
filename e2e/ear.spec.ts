import { expect, test, wrongKey } from './support';

test('Ear training: listen, play the phrase back, notes appear as they are found', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'ear', earLevel: 15 } });
  const total = await app.exercise((ex) => (ex.ear as { totalMs: number }).totalMs);
  await page.keyboard.press('Space');
  await page.waitForTimeout(total + 300);
  const steps = await app.steps();
  await app.tap(steps[0]);
  await app.tap([wrongKey(steps[1])]);
  for (const s of steps.slice(1)) await app.tap(s);
  await expect(app.results()).toBeVisible();
  // D on the piano: next phrase.
  const first = await app.exercise((ex) => ex.id);
  await expect(async () => {
    await app.tap([62]);
    expect(await app.exercise((ex) => ex.id)).not.toBe(first);
  }).toPass({ timeout: 5000 });
});
