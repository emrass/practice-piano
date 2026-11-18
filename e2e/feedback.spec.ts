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

test.describe('Meta strip', () => {
  const cells = () =>
    document.querySelector('.meta-strip')!.getBoundingClientRect().height +
    '|' +
    [...document.querySelectorAll('.meta-strip > *')].map((el) => Math.round(el.getBoundingClientRect().width * 10) / 10).join(',');
  const shownStats = () => [...document.querySelectorAll('.meta-strip > .stat')].filter((el) => el.getBoundingClientRect().width > 0).length;

  test('Its cells keep their width when the exercise changes', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'sight', sight: { mode: 'wait', level: 60, bars: 8, hands: 'both' } } });
    const before = await page.evaluate(cells);
    for (let i = 0; i < 4; i++) {
      const id = await app.exercise((ex) => ex.id);
      await page.keyboard.press('KeyN');
      await expect.poll(() => app.exercise((ex) => ex.id)).not.toBe(id);
      expect(await page.evaluate(cells)).toBe(before);
    }
    // Another lesson has other values and no level: the same tracks.
    await app.switchLesson(/Scales/);
    await expect(page.locator('.meta-strip .meta-level')).toHaveCount(0);
    expect(await page.evaluate(cells)).toBe(before);
  });

  // The strip's own width decides, not the window's: a 1079px window has no sidebar beside the stage.
  for (const [width, stats, badges] of [
    [1440, 6, true],
    [1180, 4, true],
    [1079, 6, true],
    [768, 2, true],
    [600, 2, false],
    [390, 1, false],
  ] as const) {
    test(`At ${width}px it shows ${stats} stats${badges ? ' and the badges' : ''}, none cut by the card`, async ({ app, page }) => {
      await page.setViewportSize({ width, height: 820 });
      await app.open({ settings: { lesson: 'sight', sight: { mode: 'wait', level: 8, bars: 4, hands: 'rh' } } });
      const strip = page.locator('.meta-strip');
      await expect.poll(() => page.evaluate(shownStats)).toBe(stats);
      if (badges) await expect(strip.locator('.meta-badges')).toBeVisible();
      else await expect(strip.locator('.meta-badges')).toBeHidden();
      expect((await strip.boundingBox())!.height).toBe(56);
      expect(await strip.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), 'the strip overflows').toBe(true);
      // Every stat shown has the hairline on its left, the first one too.
      const edges = await page.evaluate(() =>
        [...document.querySelectorAll('.meta-strip > .stat')].filter((el) => el.getBoundingClientRect().width > 0).map((el) => getComputedStyle(el).borderLeftWidth),
      );
      expect(edges.every((w) => w === '1px')).toBe(true);
    });
  }
});

test.describe('Hidden notes', () => {
  test('Ear: a note not found yet is hidden and a placeholder holds its place', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'ear', ear: { level: 15 } } });
    const hidden = page.locator('.score-svg .note.is-hidden');
    const placeholders = page.locator('.score-svg .score-placeholder.is-shown');
    await expect(hidden).not.toHaveCount(0);
    const steps = await app.steps();
    expect(await placeholders.count()).toBeGreaterThan(0);
    expect(await placeholders.count()).toBeLessThanOrEqual(steps.length);
    expect(await hidden.first().evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
    expect(await placeholders.first().evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
    // Listen, then play it back: every note appears and its placeholder goes.
    await page.keyboard.press('Space');
    await expect(page.locator('.practice-message')).toContainText('Play it back', { timeout: 30_000 });
    await app.playSteps();
    await expect(app.results()).toBeVisible();
    await expect(hidden).toHaveCount(0);
    await expect(placeholders).toHaveCount(0);
  });
});
