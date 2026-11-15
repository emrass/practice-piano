import { expect, test, wrongKey } from './support';

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

  test('Wait: Restart waits for the first note; the results suggest a new exercise', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'sight', sight: { mode: 'wait', level: 8, bars: 4, hands: 'rh' } } });
    const bar = page.locator('.practice-bar');
    const restart = bar.getByRole('button', { name: 'Restart' });
    await expect(restart).toBeDisabled();
    await expect(bar.getByRole('button', { name: 'New exercise' })).toBeVisible();
    const steps = await app.steps();
    await app.tap([wrongKey(steps[0])]);
    await expect(restart).toBeEnabled();
    // Restarting clears the run, so there is again nothing to restart.
    await page.keyboard.press('KeyR');
    await expect(restart).toBeDisabled();
    await app.playSteps();
    const actions = app.results().locator('.results-actions .btn');
    await expect(actions).toHaveText([/Close/, /Retry/, /New exercise/]);
    await expect(actions.last()).toBeFocused();
    await expect(page.locator('.pb-message')).toHaveText('Finished — on the piano: C retry · D new exercise');
  });

  test('Wait: with the results closed, the bar offers them and the next exercise; a restarted run shows its own', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'sight', sight: { mode: 'wait', level: 8, bars: 4, hands: 'rh' } } });
    const bar = page.locator('.practice-bar');
    await app.playSteps();
    await page.keyboard.press('Escape');
    await expect(app.results()).toBeHidden();
    await expect(bar.locator('.btn')).toHaveText([/Restart/, /Hint/, /Results/, /New exercise/]);
    await bar.getByRole('button', { name: 'Restart' }).click();
    await app.playSteps();
    await expect(app.results()).toBeVisible();
    await page.keyboard.press('Escape');
    const before = await app.steps();
    await bar.getByRole('button', { name: 'New exercise' }).click();
    await expect.poll(() => app.steps()).not.toEqual(before);
  });

  test('Wait: with the guide off, a hint shows the note and costs the step', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'sight', showKeyboardGuide: false, sight: { mode: 'wait', level: 8, bars: 4, hands: 'rh' } } });
    const steps = await app.steps();
    const hintButton = page.locator('.practice-bar .btn', { hasText: 'Hint' });
    await expect(page.locator('.key.is-expected')).toHaveCount(0);
    await hintButton.click();
    await expect(page.locator('.key.is-expected')).toHaveCount(steps[0].length);
    await app.playSteps();
    await expect(app.results()).toBeVisible();
    await expect(app.results()).toContainText('Wrong notes · 1 hint');
    await expect(app.results()).toContainText(`${steps.length - 1}/${steps.length}`);
  });

  test('Wait: while the guide lights the keys, a hint is not offered', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'sight', showKeyboardGuide: true, sight: { mode: 'wait', level: 8, bars: 4, hands: 'rh' } } });
    await expect(page.locator('.practice-bar .btn', { hasText: 'Hint' })).toBeDisabled();
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
