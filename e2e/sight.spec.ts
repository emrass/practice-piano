import { expect, test } from './support';

test.describe('Sight reading', () => {
  test('Wait: the cursor waits; a wrong key is counted, the passage passes', async ({ app }) => {
    await app.open({ settings: { lesson: 'sight', sight: { mode: 'wait', level: 8, bars: 4, hands: 'rh' } } });
    await app.playSteps({ wrongAt: 2 });
    await expect(app.results()).toBeVisible();
    await expect(app.results()).toContainText('Wrong notes');
    await expect(app.results().locator('.rg-main .rg-v')).not.toHaveText('0%');
    // Piano shortcut: C (any octave) retries once the shortcuts arm (shortly after the end).
    await expect(async () => {
      await app.tap([60]);
      await expect(app.results()).toBeHidden({ timeout: 300 });
    }).toPass({ timeout: 5000 });
    expect(await app.status()).not.toBe('finished');
  });

  test('Flow: notes on time with the playhead score timing', async ({ app }) => {
    await app.open({ settings: { lesson: 'sight', countInBars: 1, sight: { mode: 'flow', level: 20, bars: 4, hands: 'both', bpm: 132 } } });
    const run = await app.playFlow({ jitterMs: 8 });
    await app.waitUntil(run.endMs + 1500);
    await expect(app.results()).toBeVisible();
    const pitch = await app.results().locator('.rg-main .rg-v').innerText();
    expect(parseInt(pitch)).toBeGreaterThanOrEqual(95);
    await expect(app.results()).toContainText('Timing');
  });

  test('Progress tab shows the weak-spot sections', async ({ app }) => {
    await app.open({ settings: { lesson: 'sight' } });
    await app.openTab('Progress');
    await expect(app.page.locator('.sidebar')).toContainText('XP');
  });
});
