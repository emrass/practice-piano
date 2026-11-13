import { expect, progressWith, repertoireItem, test, wrongKey } from './support';

interface Target {
  symbol: string;
  voicing: number[];
  bassMidi: number | null;
  pcs: number[];
  bassPc: number | null;
}

const targets = (ex: Record<string, unknown>) =>
  (ex.chords as { targets: Target[] }).targets.map((t) => ({ symbol: t.symbol, voicing: t.voicing, bassMidi: t.bassMidi, pcs: t.pcs, bassPc: t.bassPc }));

test.describe('Chords & progressions', () => {
  test('Drill (Wait): any octave counts, a wrong key first is noted, the chart shows symbols', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'chords', chords: { task: 'drill', set: 'triads', prompt: 'symbol', inversions: 'any', mode: 'wait' } } });
    await expect(page.locator('.chord-chart .chord-card')).toHaveCount(8);
    const ts = await app.exercise(targets);
    for (let i = 0; i < ts.length; i++) {
      // One chord an octave up: the same pitch classes.
      const keys = i === 1 ? ts[i].voicing.map((k) => k + 12) : ts[i].voicing;
      if (i === 2) await app.tap([wrongKey(ts[i].voicing)]);
      await app.tap(keys);
    }
    await expect(app.results()).toBeVisible();
    await expect(app.results()).toContainText('7/8');
    await expect(app.results()).toContainText(`${ts[2].symbol}: a wrong key first`);
  });

  test('Drill (Wait): right notes over the wrong bass get a hint', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'chords', chords: { task: 'drill', set: 'triads', prompt: 'symbol', inversions: 'inversions', mode: 'wait' } } });
    const ts = await app.exercise(targets);
    // Find an inverted chord: play its tones with another chord tone lowest.
    const i = ts.findIndex((t) => t.bassPc !== null && t.bassPc !== t.voicing.map((k) => k % 12).sort((a, b) => a - b)[0]);
    for (let j = 0; j < i; j++) await app.tap(ts[j].voicing);
    const t = ts[i];
    const other = Math.min(...t.voicing.filter((k) => k % 12 !== t.bassPc));
    const keys = [other - 12, ...t.voicing];
    await app.noteOn(keys);
    await expect(page.locator('.chord-hint')).toContainText('in the bass');
    await app.noteOff(keys);
    expect(await app.status()).toBe('running');
  });

  test('Progression (Flow): on the beat moves the ladder; symbols and numerals are engraved', async ({ app, page }) => {
    // Start the item on the ladder at 120 bpm so the run is short.
    await app.open({
      settings: { lesson: 'chords', countInBars: 1, chords: { task: 'progression', progression: 'I-IV-V-I', key: 'F', hands: 'lh-bass', mode: 'flow' } },
      progress: progressWith({ 'chords/prog/I-IV-V-I/F/lh-bass': repertoireItem(120, 0) }),
    });
    await expect(page.locator('.score-card .pp-chord-symbol').first()).toContainText('F');
    await expect(page.locator('.score-card .pp-chord-numeral').first()).toHaveText('I');
    const ts = await app.exercise(targets);
    const clock = await app.startFlow();
    const bar = 16;
    await app.schedule(
      ts.map((t, i) => ({ tick: i * bar, keys: [t.bassMidi!, ...t.voicing], offsetMs: 10, holdMs: bar * clock.msPerTick - 120 })),
      clock,
    );
    await app.waitUntil(clock.t0 + ts.length * bar * clock.msPerTick + 1000);
    await expect(app.results()).toContainText('Tempo up: 120 → 124 bpm');
    await expect(app.results()).toContainText('Voice leading');
    const progress = await app.savedProgress();
    expect((progress.repertoire as Record<string, { ladderTempo: number }>)['chords/prog/I-IV-V-I/F/lh-bass'].ladderTempo).toBe(124);
  });

  test('Review plays due items first', async ({ app }) => {
    await app.open({
      settings: { lesson: 'chords', chords: { source: 'review' } },
      progress: progressWith({ 'chords/prog/canon/Eb/rh': repertoireItem(68, -1) }),
    });
    expect(await app.exercise((ex) => (ex.chords as { itemId: string }).itemId)).toBe('chords/prog/canon/Eb/rh');
    expect(await app.exercise((ex) => ex.bpm)).toBe(68);
  });
});
