import { expect, test } from './support';

/**
 * Piano & audio: the settings every lesson shares, in a dialog opened from the piano chip in
 * the top bar (not a sidebar tab).
 */

test('The sidebar holds only the lesson: Exercise and Progress', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight' } });
  await expect(page.locator('.sidebar').getByRole('tab')).toHaveText(['Exercise', 'Progress']);
});

test('With a piano connected, the chip opens Piano & audio; a key played there is not scored', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight', sight: { mode: 'wait' } } });
  const before = await page.evaluate(() => JSON.stringify(window.__ppDebug!.controller.state.get()));
  const dialog = await app.openPianoAudio();
  await expect(dialog).toContainText('Found Test Piano');
  for (const section of ['Piano', 'Audio & timing', 'Playing', 'Setup guide']) {
    await expect(dialog.getByRole('region', { name: section, exact: false }).first()).toBeVisible();
  }

  await app.tap([60]);
  await expect(dialog).toContainText('We hear you: C4');
  expect(await page.evaluate(() => JSON.stringify(window.__ppDebug!.controller.state.get()))).toBe(before);

  await dialog.getByRole('button', { name: 'Close Piano & audio' }).click();
  await expect(dialog).toHaveCount(0);
});

test('Settings changed there are saved; Escape closes it', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight', countInBars: 1, keySound: false } });
  const dialog = await app.openPianoAudio();
  await dialog.getByRole('radio', { name: '2 bars' }).click();
  await dialog.getByRole('switch', { name: 'Key sound' }).click();
  await expect.poll(() => app.savedSettings()).toMatchObject({ countInBars: 2, keySound: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('Calibration opens over Piano & audio and comes back to it', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight' } });
  const dialog = await app.openPianoAudio();
  await dialog.getByRole('button', { name: 'Calibrate latency…' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toContainText('Latency calibration');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog', { name: 'Piano & audio' })).toBeVisible();
});

for (const theme of ['light', 'dark'] as const) {
  test(`On a 360 px phone it fills the screen and scrolls inside (${theme})`, async ({ app, page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await app.open({ settings: { lesson: 'sight', theme } });
    const dialog = await app.openPianoAudio();
    const card = dialog.locator('.modal-card.settings');
    const box = (await card.boundingBox())!;
    expect(box).toMatchObject({ x: 0, width: 360 });
    expect(box.y + box.height).toBeLessThanOrEqual(640);
    expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'card overflows sideways').toBe(true);
    // The close button stays in view while the sections scroll.
    await dialog.getByRole('button', { name: 'Run setup guide again…' }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: 'Close Piano & audio' })).toBeInViewport();
  });
}
