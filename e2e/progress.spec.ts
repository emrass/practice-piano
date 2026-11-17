import { expect, progressWith, repertoireItem, test } from './support';

const DAY = 86_400_000;

/** Local YYYY-MM-DD, `ago` days before today. */
function dayAgo(ago: number): string {
  const d = new Date(Date.now() - ago * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sight reading on six days (accuracy rising), ear training on one, and one day from before the per-lesson breakdown. */
function practicedProgress() {
  const days: Record<string, unknown> = {};
  [12, 10, 7, 5, 3, 1].forEach((ago, i) => {
    days[dayAgo(ago)] = {
      exercises: 3,
      xp: 90,
      practiceMs: (5 + i * 8) * 60_000,
      lessons: { sight: { runs: 3, pitchSum: 3 * (0.6 + i * 0.07), timingRuns: 1, timingSum: 0.5 + i * 0.05, levelSum: 3 * (10 + i) } },
    };
  });
  days[dayAgo(2)] = { exercises: 2, xp: 30, practiceMs: 8 * 60_000, lessons: { ear: { runs: 2, pitchSum: 1.6, timingRuns: 0, timingSum: 0, levelSum: 20 } } };
  days[dayAgo(40)] = { exercises: 4, xp: 50, practiceMs: 20 * 60_000 };
  const item = {
    ...repertoireItem(208, 1),
    ladderLog: [
      [dayAgo(12), 180],
      [dayAgo(12), 188],
      [dayAgo(7), 200],
      [dayAgo(3), 196],
      [dayAgo(1), 208],
    ],
  };
  return { ...progressWith({ 'major/D/together': item, 'natural-minor/A/rh': repertoireItem(150, -1) }), days };
}

test('Progress tab: trend and an item’s ladder history', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight' }, progress: practicedProgress() });
  await app.openTab('Progress');
  const sidebar = page.locator('.sidebar');

  await expect(sidebar.getByText('last 6 practice days')).toBeVisible();
  await expect(sidebar.getByRole('img', { name: /^Pitch 60% on .*, 95% on .*, over 6 practice days$/ })).toBeVisible();
  await expect(sidebar.locator('.chart-legend')).toHaveText(/Pitch.*Timing \(Flow\).*Level/);

  // Ear training: too few days for a trend.
  await app.switchLesson(/Ear/);
  await expect(sidebar.getByText(/Your trend appears once you have practiced this lesson on two days \(one so far\)/)).toBeVisible();

  // Scales: tapping an item opens its ladder history.
  await app.switchLesson(/Scales/);
  const row = sidebar.getByRole('button', { name: /D major/ });
  await expect(row).toHaveAttribute('aria-expanded', 'false');
  await row.click();
  await expect(row).toHaveAttribute('aria-expanded', 'true');
  await expect(sidebar.getByRole('img', { name: /^Ladder tempo from 3 notes\/s on .* to 3.5 notes\/s on .*, goal 4 notes\/s$/ })).toBeVisible();
  // Opening another closes the first.
  await sidebar.getByRole('button', { name: /A natural minor/ }).click();
  await expect(row).toHaveAttribute('aria-expanded', 'false');
  await expect(sidebar.getByText('The history fills in as clean Flow runs move the ladder.')).toBeVisible();
});

test('Progress saved before trends existed still loads: days filled from the history, items with a ladder chart', async ({ app, page }) => {
  const old = progressWith({ 'major/G/rh': repertoireItem(120, 2) });
  old.days = { [dayAgo(1)]: { exercises: 1, xp: 10, practiceMs: 120_000 } };
  old.history = [
    {
      at: Date.now() - DAY,
      exerciseId: 'x',
      mode: 'wait',
      level: 4,
      tierId: 't01',
      pitchAccuracy: 0.9,
      timingAccuracy: null,
      medianReactionMs: 900,
      xp: 10,
      firstSight: true,
      passed: true,
    },
  ];
  await app.open({ settings: { lesson: 'sight' }, progress: old });
  await app.openTab('Progress');
  // The day was filled in from the history: one practice day of sight reading so far.
  await expect(page.locator('.sidebar').getByText(/on two days \(one so far\)/)).toBeVisible();
  await app.switchLesson(/Scales/);
  await page.locator('.sidebar').getByRole('button', { name: /G major/ }).click();
  await expect(page.locator('.sidebar .ladder-chart')).toBeVisible();
});
