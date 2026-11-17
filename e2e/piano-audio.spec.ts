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
  // The connection check is the input check: held keys and the pedal show in the keyboard bar.
  await expect(dialog.locator('.pedal')).toHaveCount(0);
  // One tab per section, opened on Piano; the setup guide is a button in the header.
  await expect(dialog.getByRole('tab')).toHaveText(['Piano', 'Audio & timing', 'Playing']);
  await expect(dialog.getByRole('tab', { selected: true })).toHaveText('Piano');
  await expect(dialog.getByRole('button', { name: 'Setup guide…' })).toBeVisible();

  await app.tap([60]);
  await expect(dialog).toContainText('We hear you: C4');
  expect(await page.evaluate(() => JSON.stringify(window.__ppDebug!.controller.state.get()))).toBe(before);

  await dialog.getByRole('button', { name: 'Close Piano & audio' }).click();
  await expect(dialog).toHaveCount(0);
});

test('Settings changed there are saved; Escape closes it', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight', countInBars: 1, keySound: false } });
  const dialog = await app.openPianoAudio();
  await dialog.getByRole('tab', { name: 'Audio & timing' }).click();
  await dialog.getByRole('radio', { name: '2 bars' }).click();
  await dialog.getByRole('tab', { name: 'Playing' }).click();
  await dialog.getByRole('switch', { name: 'Key sound' }).click();
  await expect.poll(() => app.savedSettings()).toMatchObject({ countInBars: 2, keySound: true });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('Calibration opens over Piano & audio and comes back to it', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight' } });
  const dialog = await app.openPianoAudio();
  await dialog.getByRole('tab', { name: 'Audio & timing' }).click();
  await expect(dialog.locator('.calib-row')).toContainText('Not calibrated');
  await dialog.getByRole('button', { name: 'Calibrate…' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('dialog')).toContainText('Latency calibration');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  // Back on the same tab.
  await expect(page.getByRole('dialog', { name: 'Piano & audio' }).getByRole('tab', { selected: true })).toHaveText('Audio & timing');
});

test('A calibrated setup shows its result next to the button; arrow keys move between tabs', async ({ app, page }) => {
  const calibration = { at: Date.now(), latencyMs: 42, spreadMs: 6, taps: 12, playheadDelayMs: 0, source: 'midi' };
  await app.open({ settings: { lesson: 'sight', audioSetup: 'calibrated', calibration, latencyMs: 42 } });
  const dialog = await app.openPianoAudio();
  await dialog.getByRole('tab', { name: 'Piano' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('tab', { name: 'Audio & timing' })).toBeFocused();
  await expect(dialog.locator('.calib-row')).toContainText('Calibrated · 42 ms ± 6 ms');
  await expect(dialog.getByRole('button', { name: 'Calibrate again…' })).toBeVisible();
  // No presets here any more: calibrate, or set the sliders by hand.
  await expect(dialog).not.toContainText('Quick presets');
  await page.keyboard.press('End');
  await expect(dialog.getByRole('tab', { name: 'Playing' })).toHaveAttribute('aria-selected', 'true');
});

for (const theme of ['light', 'dark'] as const) {
  test(`On a 360 px phone it fills the screen and scrolls inside (${theme})`, async ({ app, page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await app.open({ settings: { lesson: 'sight', theme } });
    const dialog = await app.openPianoAudio();
    const card = dialog;
    const box = (await card.boundingBox())!;
    expect(box).toMatchObject({ x: 0, width: 360 });
    expect(box.y + box.height).toBeLessThanOrEqual(640);
    expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'card overflows sideways').toBe(true);
    // The close and setup guide buttons stay in view while the longest tab scrolls.
    await dialog.getByRole('tab', { name: 'Audio & timing' }).click();
    await dialog.getByRole('radio', { name: '2 bars' }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: 'Close Piano & audio' })).toBeInViewport();
    await expect(dialog.getByRole('button', { name: 'Setup guide…' })).toBeInViewport();
  });
}
