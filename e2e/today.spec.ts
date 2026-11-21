import { expect, progressWith, repertoireItem, test } from './support';

/** A short plan of two blocks: the scale the lesson is set to, then sight reading. */
const today = (extra: Record<string, unknown> = {}) => ({
  way: 'today',
  plan: { minutes: 10, lessons: { scales: true, sight: true, ear: false, rhythm: false, chords: false } },
  lesson: 'ear',
  sight: { mode: 'wait', level: 8, bars: 4, hands: 'rh' },
  scales: { type: 'major', tonic: 'G', hands: 'rh', octaves: 1, noteValue: 'eighth', mode: 'wait' },
  ...extra,
});

test.describe("Today's practice", () => {
  test('A plan runs through its blocks: start, hand-off on the results card, summary', async ({ app, page }) => {
    await app.open({ settings: today() });
    // The plan page: the blocks in order with their reasons, the first one ready to start.
    const blocks = page.locator('.plan-list > li');
    await expect(blocks).toHaveCount(2);
    await expect(blocks.nth(0)).toContainText('Scales & arpeggios');
    await expect(blocks.nth(0)).toContainText('Not tried yet');
    await expect(blocks.nth(1)).toContainText('Sight reading');
    await expect(blocks.nth(1)).toContainText('Level 8');
    const start = page.getByRole('button', { name: /Start scales/ });
    await expect(start).toBeFocused();

    // Enter starts the block: its lesson is on the stage, the steps are in the top bar.
    await page.keyboard.press('Enter');
    const steps = page.locator('.plan-steps > li');
    await expect(steps).toHaveCount(2);
    await expect(steps.nth(0)).toHaveAttribute('aria-current', 'step');
    await expect(page.locator('.meta-title')).toHaveText('G major scale');
    await expect(page.locator('.topbar-lesson [role=radio]')).toHaveCount(0);
    const runs = await steps.nth(0).locator('.pips > i').count();

    // Every finished run counts. Until the block has its runs, the lesson's own way on leads.
    for (let i = 1; i < runs; i++) {
      await app.playSteps();
      await expect(app.results().locator('.btn-primary')).toContainText('Again');
      await expect(steps.nth(0).locator('.pips > i.is-done')).toHaveCount(i);
      await page.keyboard.press('Enter');
      await expect(app.results()).toBeHidden();
    }
    // The last run hands over: the way on names the next block, on the button and on the piano.
    await app.playSteps();
    await expect(app.results().locator('.btn-primary')).toContainText('Next: sight reading');
    await expect(app.results()).toContainText('Scales & arpeggios is done for today. Up next: sight reading');
    await expect(app.results().locator('.results-shortcuts')).toContainText('Next: sight reading');
    await expect(async () => {
      await app.tap([62]); // D, once the shortcuts arm
      await expect(page.locator('.meta-level')).toHaveText('L8', { timeout: 300 });
    }).toPass({ timeout: 5000 });
    await expect(steps.nth(0)).toHaveClass(/is-done/);
    await expect(steps.nth(1)).toHaveAttribute('aria-current', 'step');

    // What is changed during a block stays in today's plan: one level harder here (G on the
    // piano after a run), and the player's own sight-reading level is as it was.
    await app.playSteps();
    await expect(async () => {
      await app.tap([67]);
      await expect(page.locator('.meta-level')).toHaveText('L9', { timeout: 300 });
    }).toPass({ timeout: 5000 });
    expect(((await app.savedSettings()).sight as { level: number }).level).toBe(8);

    const sightRuns = await steps.nth(1).locator('.pips > i').count();
    for (let i = 2; i <= sightRuns; i++) {
      await app.playSteps();
      await expect(app.results()).toBeVisible();
      if (i < sightRuns) await page.keyboard.press('KeyN');
    }
    // The last block ends the plan: back on the page, which is now the summary.
    await expect(app.results().locator('.btn-primary')).toContainText('Finish');
    await page.keyboard.press('Enter');
    await expect(page.locator('.plan-title')).toHaveText('Done for today');
    await expect(blocks.nth(0)).toContainText(`${runs} of ${runs} passed.`);
    await expect(page.locator('.plan-sheet .stat-tile')).toHaveCount(4);

    // The day's plan is kept: a reload opens on the same summary.
    await page.reload();
    await expect(page.locator('.plan-title')).toHaveText('Done for today');
    // Free practice is as the player left it.
    await page.getByRole('button', { name: 'Go to free practice' }).click();
    await expect(page.locator('.topbar-lesson [role=radio][aria-checked=true]')).toContainText(/Ear/);
    // Settings are saved a moment after they change.
    await expect.poll(async () => (await app.savedSettings()).way).toBe('free');
    const saved = await app.savedSettings();
    expect((saved.scales as { tonic: string; source?: string }).tonic).toBe('G');
    expect((saved.sight as { level: number }).level).toBe(8);
  });

  test('Due scales are the warm-up, and the block is as long as what is due', async ({ app, page }) => {
    await app.open({
      settings: today(),
      progress: progressWith({ 'major/D/rh': repertoireItem(120, -2), 'major/A/rh': repertoireItem(120, -1), 'major/E/rh': repertoireItem(120, 3) }),
    });
    const first = page.locator('.plan-list > li').first();
    await expect(first).toContainText('2 due items. Starts with D major scale.');
    await page.getByRole('button', { name: /Start scales/ }).click();
    // The most overdue item first, whatever key the lesson itself is set to.
    await expect(page.locator('.meta-title')).toHaveText('D major scale');
    await app.playSteps();
    await expect(app.results().locator('.btn-primary')).toContainText('Next due item');
    await page.keyboard.press('Enter');
    await expect(page.locator('.meta-title')).toHaveText('A major scale');
    // Review belongs to the block: free practice is still set to the player's own item.
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.getByRole('radio', { name: 'Free practice' }).click();
    await expect.poll(async () => (await app.savedSettings()).way).toBe('free');
    expect(((await app.savedSettings()).scales as { source?: string }).source).not.toBe('review');
  });

  test('Skip a block, go back to the plan, and continue where it was', async ({ app, page }) => {
    await app.open({ settings: today() });
    await page.getByRole('button', { name: 'Skip block' }).click();
    const blocks = page.locator('.plan-list > li');
    await expect(blocks.nth(0)).toHaveClass(/is-skipped/);
    await expect(blocks.nth(0)).toContainText('Skipped.');
    // A skip can be taken back: the block is in the plan again, in its place, and next.
    await page.getByRole('button', { name: 'Bring back scales' }).click();
    await expect(blocks.nth(0)).toHaveAttribute('aria-current', 'step');
    await expect(page.getByRole('button', { name: /Start scales/ })).toBeFocused();
    await page.getByRole('button', { name: 'Skip block' }).click();
    await page.getByRole('button', { name: /Start sight reading/ }).click();
    await app.playSteps();
    await expect(app.results()).toBeVisible();
    // Back to the plan: the block shows what is played and offers to continue.
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(blocks.nth(1).locator('.pips > i.is-done')).toHaveCount(1);
    // The piano starts it too: D, from silence.
    await expect(async () => {
      await app.tap([62]);
      await expect(page.locator('.plan-steps')).toBeVisible({ timeout: 300 });
    }).toPass({ timeout: 5000 });
    await expect(page.locator('.plan-steps > li').nth(1).locator('.pips > i.is-done')).toHaveCount(1);
  });

  test('A block brought back after the plan is finished puts it under way again', async ({ app, page }) => {
    await app.open({ settings: today() });
    await page.getByRole('button', { name: 'Skip block' }).click();
    await page.getByRole('button', { name: 'Skip block' }).click();
    await expect(page.locator('.plan-title')).toHaveText('Done for today');
    await page.getByRole('button', { name: 'Bring back sight reading' }).click();
    await expect(page.locator('.plan-title')).toHaveText("Today's practice");
    const blocks = page.locator('.plan-list > li');
    await expect(blocks.nth(0)).toHaveClass(/is-skipped/);
    await expect(blocks.nth(1)).toHaveAttribute('aria-current', 'step');
    // It is kept: a reload shows the same plan.
    await page.reload();
    await expect(page.getByRole('button', { name: /Start sight reading/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bring back scales' })).toBeVisible();
  });

  test('The length and the lessons make the plan until it is under way', async ({ app, page }) => {
    await app.open({ settings: today() });
    const blocks = page.locator('.plan-list > li');
    await page.getByRole('switch', { name: /Rhythm/ }).click();
    await expect(blocks).toHaveCount(3);
    await page.getByRole('radio', { name: '20 min' }).click();
    await expect(page.locator('.plan-sheet .progress-row .num')).toContainText(/of (19|20|21) min/);
    await page.getByRole('switch', { name: /Scales/ }).click();
    await expect(blocks.first()).toContainText('Sight reading');
    // Once a block is played or skipped, today's plan keeps its blocks.
    await page.getByRole('button', { name: 'Skip block' }).click();
    await page.getByRole('radio', { name: '10 min' }).click();
    await expect(page.locator('.sidebar .callout')).toContainText("Today's plan is under way.");
    await expect(blocks).toHaveCount(2);
  });

  test('Free practice and Today switch from the top bar', async ({ app, page }) => {
    await app.open({ settings: { lesson: 'sight' } });
    await page.getByRole('radio', { name: 'Today' }).click();
    await expect(page.locator('.plan-title')).toHaveText("Today's practice");
    await expect(page.locator('.topbar-lesson')).toHaveCount(0);
    await expect.poll(async () => (await app.savedSettings()).way).toBe('today');
    await page.getByRole('radio', { name: 'Free practice' }).click();
    await expect(page.locator('.stage .score')).toBeVisible();
    await expect(page.locator('.topbar-lesson [role=radio]')).toHaveCount(5);
  });
});

for (const width of [390, 768, 1100, 1440, 1800]) {
  test(`Today: the top bar fits at ${width}px on the plan page and during a block`, async ({ app, page }) => {
    await page.setViewportSize({ width, height: 800 });
    await app.open({ settings: { ...today(), plan: { minutes: 30, lessons: { scales: true, sight: true, ear: true, rhythm: true, chords: true } } } });
    const fits = async (where: string) => {
      const [scroll, client] = await page.locator('.topbar').evaluate((el) => [el.scrollWidth, el.clientWidth]);
      expect(scroll, `${where}: top bar overflows`).toBeLessThanOrEqual(client);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${where}: page scrolls sideways`).toBeLessThanOrEqual(width);
    };
    await fits('plan page');
    const sheet = await page.locator('.plan-sheet').boundingBox();
    expect(sheet!.x + sheet!.width).toBeLessThanOrEqual(width);
    await page.getByRole('button', { name: /Start scales/ }).click();
    await expect(page.locator('.plan-steps > li')).toHaveCount(5);
    await fits('block');
    // The block under way always shows its name.
    const clipped = await page.locator('.plan-steps > li[aria-current] .plan-step-name').evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(clipped, 'the current step is clipped').toBe(false);
  });
}
