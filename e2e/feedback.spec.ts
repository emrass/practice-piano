import { expect, progressWith, test, wrongKey } from './support';

/**
 * The second cue beside every feedback color (design/system: "never by color alone"): marks
 * under notes, marks on keys, and heat bands with a legend.
 */

/** The mark drawn under the notes of a step. */
const marksOf = (step: number) => `.score-svg .score-mark[data-step="${step}"]`;

test.describe('Marks under notes', () => {
  test('Flow: a late note gets a tilde, a missed note a cross, a right note none', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'sight', showStaffNames: true, countInBars: 1, sight: { mode: 'flow', level: 8, bars: 4, hands: 'rh', bpm: 80 } } });
    const steps = await page.evaluate(() => window.__ppDebug!.exercise.steps.map((s) => ({ tick: s.tick, midis: s.midis })));
    const clock = await app.startFlow();
    // On time, late, then nothing: the third note is missed.
    await app.schedule(
      [
        { tick: steps[0].tick, keys: steps[0].midis },
        { tick: steps[1].tick, keys: steps[1].midis, offsetMs: 260 },
      ],
      clock,
    );
    await app.waitUntil(clock.t0 + steps[3].tick * clock.msPerTick + 100);
    await expect(page.locator('.score-svg .note.is-good')).toHaveCount(1);
    await expect(page.locator(marksOf(0))).toHaveText('');
    await expect(page.locator('.score-svg .note.is-ok')).toHaveCount(1);
    await expect(page.locator(marksOf(1))).toHaveText('~');
    await expect(page.locator(marksOf(1))).toHaveClass(/is-ok/);
    await expect(page.locator(marksOf(2))).toHaveText('×');
    // The mark is under its note's name, in the color of the note's state.
    const [mark, label] = await Promise.all([page.locator(marksOf(2)).boundingBox(), page.locator('.score-svg .score-label[data-step="2"]').boundingBox()]);
    expect(mark!.y).toBeGreaterThan(label!.y);
    expect(Math.abs(mark!.x + mark!.width / 2 - (label!.x + label!.width / 2))).toBeLessThan(2);
    await page.keyboard.press('Space'); // stop
  });

  test('Wait: a note found after a wrong key gets a tilde; a new run clears it', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'sight', sight: { mode: 'wait', level: 8, bars: 4, hands: 'rh' } } });
    const steps = await app.steps();
    await app.tap(steps[0]);
    await app.tap([wrongKey(steps[1])]);
    await app.tap(steps[1]);
    await expect(page.locator(marksOf(0))).toHaveText('');
    await expect(page.locator(marksOf(1))).toHaveText('~');
    await page.keyboard.press('KeyR');
    await expect(page.locator(marksOf(1))).toHaveText('');
  });
});

test.describe('Marks on keys', () => {
  /** What a key draws above its label (the ::before of the design system's Keyboard). */
  const cue = (midi: number) => `document.querySelector('.keys .key[data-midi="${midi}"]')`;

  test('The key to play carries a dot, a wrong key a cross for as long as the bar says so, a right key neither', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'sight', showKeyboardGuide: true, sight: { mode: 'wait', level: 8, bars: 4, hands: 'rh' } } });
    const steps = await app.steps();
    const next = steps[0][0];
    const wrong = wrongKey(steps[0]);
    const before = (midi: number) => page.evaluate((sel) => getComputedStyle(eval(sel) as Element, '::before').content, cue(midi));
    await expect(page.locator(`.key[data-midi="${next}"]`)).toHaveClass(/is-expected/);
    expect(await before(next)).toBe('""'); // the dot: an empty box with a fill
    expect(await before(wrong)).toBe('none');

    await app.noteOn([wrong]);
    await expect(page.locator(`.key[data-midi="${wrong}"]`)).toHaveClass(/is-wrong/);
    expect(await before(wrong)).toBe('"×"');
    await expect(page.locator('.practice-status')).toHaveClass(/is-wrong/);
    await expect(page.locator('.score-cursor')).toHaveClass(/is-wrong/);
    await app.noteOff([wrong]);
    // The flash ends: the cross and the red cursor go with it.
    await expect(page.locator(`.key[data-midi="${wrong}"]`)).not.toHaveClass(/is-wrong/);
    await expect(page.locator('.score-cursor')).not.toHaveClass(/is-wrong/);
    expect(await before(wrong)).toBe('none');

    await app.noteOn([next]);
    await expect(page.locator(`.key[data-midi="${next}"]`)).toHaveClass(/is-correct|is-held/);
    await app.noteOff([next]);
  });
});

test.describe('Heatmap', () => {
  const note = (attempts: number, correct: number) => ({ attempts, correct, reactions: [], timingSum: 0, timingCount: 0 });

  test('Five bands and a legend; a note with too few attempts stays blank', async ({ app, page }) => {
    const progress = progressWith({});
    progress.stats = {
      note: {
        'treble:60': note(10, 5), // 50%: band 1
        'treble:62': note(10, 7), // 70%: band 2
        'treble:64': note(10, 8), // 80%: band 3
        'treble:65': note(10, 9), // 90%: band 4
        'treble:67': note(10, 10), // 100%: band 5
        'treble:69': note(2, 0), // too few to judge
        'treble:61': note(8, 6), // a black key, 75%: band 3
      },
    };
    await app.open({ settings: { lesson: 'sight' }, progress });
    await app.openTab('Progress');
    const treble = page.getByRole('img', { name: /Note accuracy, treble clef/ });
    await expect(treble).toHaveAttribute('aria-label', /Weakest: C4 at 50 percent/);
    const key = (name: string) => treble.locator(`[title^="${name}:"]`);
    await expect(key('C4')).toHaveClass(/heat-1/);
    await expect(key('D4')).toHaveClass(/heat-2/);
    await expect(key('E4')).toHaveClass(/heat-3/);
    await expect(key('F4')).toHaveClass(/heat-4/);
    await expect(key('G4')).toHaveClass(/heat-5/);
    await expect(key('A4')).not.toHaveClass(/heat-\d/);
    await expect(key('A4')).toHaveAttribute('title', /too few to judge/);
    await expect(key('C♯4')).toHaveClass(/heat-sharp heat-3/);
    // The fill is the band's token, not a computed hue.
    const fills = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const probe = document.createElement('i');
      document.body.appendChild(probe);
      const token = (n: number) => {
        probe.style.backgroundColor = root.getPropertyValue(`--heat-${n}`);
        return getComputedStyle(probe).backgroundColor;
      };
      const tokens = [1, 2, 3, 4, 5].map(token);
      probe.remove();
      const keys = [1, 2, 3, 4, 5].map((n) => getComputedStyle(document.querySelector(`.heatmap .heat-key.heat-${n}`)!).backgroundColor);
      return { tokens, keys };
    });
    expect(fills.keys).toEqual(fills.tokens);
    await expect(page.getByRole('list', { name: 'Accuracy bands' }).getByRole('listitem')).toHaveText(['under 60%', '60–74%', '75–84%', '85–94%', '95% and up']);
    // Octave names sit under the strip, each under its own key.
    const c4 = (await key('C4').boundingBox())!;
    const label = (await page.locator('.heat-axis span', { hasText: 'C4' }).first().boundingBox())!;
    expect(label.y).toBeGreaterThanOrEqual(c4.y + c4.height - 1);
    expect(Math.abs(label.x + label.width / 2 - (c4.x + c4.width / 2))).toBeLessThan(1.5);
  });
});
