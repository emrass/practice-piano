import { expect, test, wrongKey, type App } from './support';

/**
 * VexFlow draws in black by default (presentation attributes on the root <svg>, inherited by
 * stems and the brace). The score's CSS has to re-theme all of it, or dark mode shows black
 * marks on dark paper.
 */

/** Drawn elements of the score whose computed fill or stroke is still VexFlow's black. */
function blackMarks(app: App): Promise<string[]> {
  return app.page.evaluate(() => {
    const found: string[] = [];
    for (const el of document.querySelectorAll('.score-svg *')) {
      if (el.tagName === 'g') continue;
      const cs = getComputedStyle(el);
      if (cs.fill === 'rgb(0, 0, 0)') found.push(`fill on ${el.tagName} in .${el.parentElement?.getAttribute('class')}`);
      if (cs.stroke === 'rgb(0, 0, 0)' && parseFloat(cs.strokeWidth) > 0) found.push(`stroke on ${el.tagName} in .${el.parentElement?.getAttribute('class')}`);
    }
    return [...new Set(found)];
  });
}

/** Notes whose stem is drawn in a different color than their head. */
function stemsOffColor(app: App): Promise<string[]> {
  return app.page.evaluate(() =>
    [...document.querySelectorAll('.score-svg .note')].flatMap((note) => {
      const head = note.querySelector('.vf-notehead path');
      const stem = note.querySelector('.vf-stem path');
      if (!head || !stem) return [];
      const fill = getComputedStyle(head).fill;
      const stroke = getComputedStyle(stem).stroke;
      return fill === stroke ? [] : [`${note.getAttribute('class')}: head ${fill}, stem ${stroke}`];
    }),
  );
}

const LESSONS = {
  'Sight, both hands': { lesson: 'sight', sight: { mode: 'wait', level: 60, bars: 4, hands: 'both' } },
  Scales: { lesson: 'scales' },
  'Chord progressions': { lesson: 'chords', chords: { task: 'progression' } },
  Rhythm: { lesson: 'rhythm', rhythm: { task: 'read', level: 40, hands: 'rh', bars: 4, bpm: 120 } },
  Ear: { lesson: 'ear', ear: { level: 15 } },
};

test.describe('Score in dark mode', () => {
  for (const [name, settings] of Object.entries(LESSONS)) {
    test(`${name}: nothing is drawn in VexFlow's default black`, async ({ app, page }) => {
      await app.open({ settings: { ...settings, theme: 'dark' } });
      await expect(page.locator('.score-svg .note').first()).toBeAttached();
      expect(await blackMarks(app)).toEqual([]);
    });
  }

  test('Stems take the color of their note: current, right and wrong', async ({ app, page }) => {
    await app.open({ settings: { theme: 'dark', lesson: 'sight', sight: { mode: 'wait', level: 8, bars: 4, hands: 'rh' } } });
    await expect(page.locator('.score-svg .note.is-current')).toHaveCount(1);
    expect(await stemsOffColor(app)).toEqual([]);

    const steps = await app.steps();
    await app.tap(steps[0]);
    await app.tap([wrongKey(steps[1])]);
    await app.tap(steps[1]);
    await expect(page.locator('.score-svg .note.is-good, .score-svg .note.is-ok, .score-svg .note.is-bad')).not.toHaveCount(0);
    await page.waitForTimeout(200); // past the color transition
    expect(await stemsOffColor(app)).toEqual([]);
    expect(await blackMarks(app)).toEqual([]);
  });
});
