import { expect, test } from './support';

test.describe('Rhythm', () => {
  test('Read: taps on the beat pass with good timing', async ({ app }) => {
    await app.open({ settings: { lesson: 'rhythm', countInBars: 1, rhythm: { task: 'read', level: 20, hands: 'rh', bars: 4, bpm: 120 } } });
    const run = await app.playFlow({ jitterMs: 10 });
    await app.waitUntil(run.endMs + 1500);
    await expect(app.results()).toBeVisible();
    await expect(app.results()).toContainText('Tendency');
  });

  test('Echo: only the answer bars are played', async ({ app }) => {
    await app.open({ settings: { lesson: 'rhythm', countInBars: 1, rhythm: { task: 'echo', level: 20, hands: 'rh', bars: 4, bpm: 120 } } });
    const calls = await app.exercise((ex) => (ex.rhythm as { callBars: number[] }).callBars);
    expect(calls.length).toBeGreaterThan(0);
    const run = await app.playFlow({ skipBars: calls });
    await app.waitUntil(run.endMs + 1500);
    await expect(app.results()).toBeVisible();
    const hits = await app.results().locator('.rg-main .rg-v').innerText();
    expect(parseInt(hits)).toBeGreaterThanOrEqual(90);
  });
});
