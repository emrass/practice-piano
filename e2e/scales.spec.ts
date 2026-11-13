import { expect, test } from './support';

const SCALE = { lesson: 'scales', scaleType: 'major', scaleTonic: 'G', scaleHands: 'rh', scaleOctaves: 1, scaleNoteValue: 'eighth', countInBars: 1 };

test.describe('Scales & arpeggios', () => {
  test('Flow: a clean run moves the tempo ladder up and schedules a review', async ({ app }) => {
    await app.open({ settings: { ...SCALE, scaleMode: 'flow' } });
    const run = await app.playFlow({ jitterMs: 5 });
    await app.waitUntil(run.endMs + 1500);
    await expect(app.results()).toContainText('Tempo up');
    const progress = await app.savedProgress();
    const item = (progress.repertoire as Record<string, { cleanRuns: number }>)['major/G/rh'];
    expect(item.cleanRuns).toBe(1);
  });

  test('Wait: notes in place, fingering printed, nothing on the ladder changes', async ({ app, page }) => {
    await app.open({ settings: { ...SCALE, scaleMode: 'wait' } });
    await expect(page.locator('.score-card svg .pp-finger').first()).toBeVisible();
    await app.playSteps();
    await expect(app.results()).toContainText('Notes in place');
  });

  test('Play from memory hides the notation', async ({ app, page }) => {
    await app.open({ settings: { ...SCALE, scaleMode: 'wait', scaleNotation: false } });
    await expect(page.locator('.memory-card')).toBeVisible();
    await expect(page.locator('.score-card svg')).toHaveCount(0);
  });
});
