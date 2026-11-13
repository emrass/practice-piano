import { expect, test } from './support';

/** G major, right hand, one octave in eighths, plus the given scale settings. */
const scale = (extra: Record<string, unknown>) => ({
  lesson: 'scales',
  countInBars: 1,
  scales: { type: 'major', tonic: 'G', hands: 'rh', octaves: 1, noteValue: 'eighth', ...extra },
});

test.describe('Scales & arpeggios', () => {
  test('Flow: a clean run moves the tempo ladder up and schedules a review', async ({ app }) => {
    await app.open({ settings: scale({ mode: 'flow' }) });
    const run = await app.playFlow({ jitterMs: 5 });
    await app.waitUntil(run.endMs + 1500);
    await expect(app.results()).toContainText('Tempo up');
    const progress = await app.savedProgress();
    const item = (progress.repertoire as Record<string, { cleanRuns: number }>)['major/G/rh'];
    expect(item.cleanRuns).toBe(1);
  });

  test('Wait: notes in place, fingering printed, nothing on the ladder changes', async ({ app, page }) => {
    await app.open({ settings: scale({ mode: 'wait' }) });
    await expect(page.locator('.score-card svg .pp-finger').first()).toBeVisible();
    await app.playSteps();
    await expect(app.results()).toContainText('Notes in place');
  });

  test('Play from memory hides the notation', async ({ app, page }) => {
    await app.open({ settings: scale({ mode: 'wait', notation: false }) });
    await expect(page.locator('.memory-card')).toBeVisible();
    await expect(page.locator('.score-card svg')).toHaveCount(0);
  });

  test('Review shows the due item in the panel; Wait leaves it due; editing it picks from it', async ({ app, page }) => {
    // The pick is G major RH; D major hands together is due.
    const due = { 'major/D/together': { ladderTempo: 160, dueAt: 1, lastAt: 1, attempts: 2, box: 1 } };
    await app.open({ settings: scale({ mode: 'wait', source: 'review' }), progress: { repertoire: due } });
    const panel = page.locator('.sidebar');
    await expect(panel.locator('.item-status-title')).toContainText('D major');
    await expect(panel.getByLabel('Key', { exact: true })).toHaveValue('D');
    await expect(panel.getByRole('radiogroup', { name: 'Hands' }).getByRole('radio', { checked: true })).toHaveText('Together');
    await expect(panel.locator('.review-note.is-wait')).toContainText('stays due');

    await app.playSteps();
    await expect(app.results()).toContainText('move only in Flow');
    const item = ((await app.savedProgress()).repertoire as Record<string, { dueAt: number }>)['major/D/together'];
    expect(item.dueAt).toBeLessThan(Date.now());
    await page.keyboard.press('Escape');

    // Switching to Flow changes the note; changing the hands starts a pick from D major.
    await page.getByRole('radio', { name: 'Flow', exact: true }).click();
    await expect(panel.locator('.review-note')).not.toHaveClass(/is-wait/);
    await panel.getByRole('radiogroup', { name: 'Hands' }).getByRole('radio', { name: 'RH', exact: true }).click();
    await expect.poll(async () => (await app.savedSettings()).scales).toMatchObject({ source: 'pick', type: 'major', tonic: 'D', hands: 'rh' });
    await expect(panel.locator('.review-note')).toHaveCount(0);
    await expect(panel.locator('.item-status-title')).toContainText('D major');
  });
});
