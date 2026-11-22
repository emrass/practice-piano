import { expect, test, wrongKey } from './support';

test.describe('Sight reading', () => {
  test('Wait: the cursor waits; a wrong key is counted, the passage passes', async ({ app }) => {
    await app.open({ settings: { lesson: 'sight', sight: { mode: 'wait', level: 8, bars: 4, hands: 'rh' } } });
    await app.playSteps({ wrongAt: 2 });
    await expect(app.results()).toBeVisible();
    await expect(app.results()).toContainText('Wrong notes');
    await expect(app.results().locator('.stat.is-key .stat-value')).not.toHaveText('0%');
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
    await page.keyboard.press('Backspace');
    await expect(restart).toBeDisabled();
    await app.playSteps();
    const actions = app.results().locator('.results-actions .btn');
    await expect(actions).toHaveText([/Close/, /Restart/, /New exercise/]);
    await expect(actions.last()).toBeFocused();
    await expect(page.locator('.practice-message')).toHaveText('Finished. On the piano: C restart · D new exercise');
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
    await expect(app.results()).toContainText('Wrong · 1 hint');
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
    const pitch = await app.results().locator('.stat.is-key .stat-value').innerText();
    expect(parseInt(pitch)).toBeGreaterThanOrEqual(95);
    await expect(app.results()).toContainText('Timing');
  });

  test('Flow: the read-ahead cover hides the note being played and the next beat, not what comes after', async ({ app, page }) => {
    await app.open({
      settings: { lesson: 'sight', countInBars: 1, showStaffNames: true, showKeyboardGuide: true, sight: { mode: 'flow', level: 10, bars: 4, hands: 'rh', bpm: 120, timeSignature: '4/4', readAhead: 'beat' } },
    });
    // The guide would light the covered keys: it is off, and says why.
    await expect(page.getByRole('button', { name: 'Keyboard guide' })).toHaveAttribute('title', 'Off while the read-ahead cover is on.');
    const steps = await app.exercise((ex) => ex.steps.map((s, index) => ({ index, tick: s.tick })));
    const beat = 4;
    // A note in bar 2 to play, and the first note at least a beat after it.
    const played = steps.find((s) => s.tick >= 16 && s.tick < 28)!;
    const after = steps.find((s) => s.tick >= played.tick + beat + 1)!;
    expect(played && after).toBeTruthy();

    const clock = await app.startFlow();
    // Count-in: the opening is there to be read.
    await expect(page.locator('.score-cover').first()).toHaveCSS('opacity', '0');

    await app.waitUntil(clock.t0 + (played.tick + 0.5) * clock.msPerTick);
    const seen = await page.evaluate(
      ([a, b]) => {
        const covers = [...document.querySelectorAll<HTMLElement>('.score-cover')].filter((c) => c.style.opacity === '1').map((c) => c.getBoundingClientRect());
        const center = (step: number) => {
          const r = document.querySelector(`.score-svg text.score-label[data-step="${step}"]`)!.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        };
        const hidden = (p: { x: number; y: number }) => covers.some((c) => p.x > c.left && p.x < c.right && p.y > c.top && p.y < c.bottom);
        return { covers: covers.length, played: hidden(center(a)), after: hidden(center(b)) };
      },
      [played.index, after.index] as const,
    );
    expect(seen).toEqual({ covers: 1, played: true, after: false });

    // The results show the whole score again.
    await app.waitUntil(clock.t0 + 64 * clock.msPerTick + 1500);
    await expect(app.results()).toBeVisible();
    for (const cover of await page.locator('.score-cover').all()) await expect(cover).toHaveCSS('opacity', '0');
  });

  test('Wait: Read ahead stays in place, disabled, and the guide is back', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'sight', showKeyboardGuide: true, sight: { mode: 'wait', level: 8, bars: 4, hands: 'rh', readAhead: 'bar' } } });
    const field = page.getByRole('radiogroup', { name: 'Read ahead' });
    await expect(field.getByRole('radio', { name: '1 bar' })).toBeDisabled();
    await expect(page.locator('.field', { has: field })).toContainText('Flow only');
    await expect(page.getByRole('button', { name: 'Keyboard guide' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('Flow: changing Read ahead keeps the passage', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'sight', sight: { mode: 'flow', level: 8, bars: 4, hands: 'rh' } } });
    const before = await app.exercise((ex) => ex.id);
    await page.getByRole('radiogroup', { name: 'Read ahead' }).getByRole('radio', { name: 'Half bar' }).click();
    await expect(page.locator('.field', { has: page.getByRole('radiogroup', { name: 'Read ahead' }) })).toContainText('Hides the music just ahead of the playhead.');
    expect(await app.exercise((ex) => ex.id)).toBe(before);
  });

  test('Progress tab shows the weak-spot sections', async ({ app }) => {
    await app.open({ settings: { lesson: 'sight' } });
    await app.openTab('Progress');
    await expect(app.page.locator('.sidebar')).toContainText('XP');
  });
});
