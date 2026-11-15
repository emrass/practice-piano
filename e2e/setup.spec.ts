import type { Page } from '@playwright/test';
import { expect, fakeMidi, test } from './support';

/**
 * The first-run setup guide: connect a piano, say how well you play, line up the metronome.
 * These tests start from an empty profile (the other specs seed one that has seen the guide).
 */

type Json = Record<string, unknown>;

/** A browser without Web MIDI (Safari, Firefox, every iPad browser). */
function noMidi() {
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: undefined });
}

/** Web MIDI with nothing connected; `window.__plug()` connects "Test Piano". */
function unpluggedMidi() {
  const input = { id: 'fake1', name: 'Test Piano', manufacturer: 'Test', state: 'connected', onmidimessage: null as null | ((e: unknown) => void) };
  const access = { inputs: new Map<string, typeof input>(), outputs: new Map(), onstatechange: null as null | (() => void) };
  Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
  (window as unknown as { __plug(): void }).__plug = () => {
    access.inputs.set('fake1', input);
    access.onstatechange?.();
  };
}

async function openNew(page: Page, midi: () => void = fakeMidi): Promise<void> {
  await page.addInitScript(midi);
  await page.goto('/');
  await page.waitForFunction(() => !!window.__ppDebug?.exercise);
}

/** The settings the app saved for the profile it created. */
function saved(page: Page): Promise<Json> {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith('/settings'));
    return key ? JSON.parse(localStorage.getItem(key)!) : {};
  });
}

const guide = (page: Page) => page.getByRole('dialog');
const button = (page: Page, name: string | RegExp) => guide(page).getByRole('button', { name });

test('First run: a connected piano is offered at once, confirmed by a key, and the choices are saved', async ({ app, page }) => {
  await openNew(page);
  await expect(guide(page)).toContainText('Connect your piano');
  await expect(guide(page)).toContainText('step 1 of 3');
  await expect(guide(page)).toContainText('Found Test Piano');

  // The key played for the check is not taken as an answer to the exercise underneath.
  const before = await page.evaluate(() => JSON.stringify(window.__ppDebug!.controller.state.get()));
  await app.tap([60]);
  await expect(guide(page)).toContainText('We hear you: C4');
  await expect(guide(page)).toContainText('on Test Piano');
  expect(await page.evaluate(() => JSON.stringify(window.__ppDebug!.controller.state.get()))).toBe(before);

  await button(page, 'Next').click();
  await expect(guide(page)).toContainText('How well do you play?');
  await expect(guide(page).getByRole('combobox')).toHaveCount(0);
  await guide(page).getByRole('radio', { name: /Elementary/ }).click();
  await expect(guide(page).getByLabel('Reading music')).toHaveValue('3');
  await expect(guide(page).getByLabel('Reading music').locator('option:checked')).toHaveText('I read both hands in easy keys');
  await expect(guide(page).getByLabel('Playing by ear').locator('option:checked')).toHaveText('I can play back short tunes within five notes');
  await expect(guide(page).getByLabel('Scales & chords').locator('option:checked')).toHaveText('I know a few major scales and basic chords');

  await button(page, 'Next').click();
  await expect(guide(page)).toContainText('Line up the metronome');
  await button(page, /Headphones on piano/).click();
  await button(page, 'Start practising').click();
  await expect(guide(page)).toHaveCount(0);

  await expect.poll(() => saved(page)).toMatchObject({
    setupGuideSeen: true,
    experience: { reading: 3, ear: 2, technique: 1 },
    sight: { level: 16, hands: 'both' },
    rhythm: { level: 17 },
    ear: { level: 13 },
    scales: { hands: 'rh', octaves: 2 },
    chords: { set: 'triads', inversions: 'root' },
    audioSetup: 'headphones',
    latencyMs: 180,
    keySound: false,
  });
  // The exercise on screen is one at the new level, for both hands.
  expect(await app.exercise((ex) => [(ex.meta as { level: number }).level, ex.hands])).toEqual([16, 'both']);

  await page.reload();
  await page.waitForFunction(() => !!window.__ppDebug?.exercise);
  await expect(page.locator('.chip-midi')).toHaveClass(/is-on/);
  await expect(guide(page)).toHaveCount(0);
});

test('A browser without MIDI says so, and continuing without a piano turns the key sound on', async ({ page }) => {
  await openNew(page, noMidi);
  await expect(guide(page)).toContainText('This browser can’t connect to a piano');
  await expect(guide(page)).toContainText('Chrome');
  await expect(button(page, 'Next')).toHaveCount(0);

  await button(page, 'Continue without a piano').click();
  await expect(guide(page)).toContainText('Playing without a piano');
  await button(page, 'Continue without a piano').click();

  // No metronome step: a calibration without the piano would measure the wrong thing.
  await expect(guide(page)).toContainText('step 2 of 2');
  await guide(page).getByRole('radio', { name: /New to the piano/ }).click();
  await button(page, 'Start practising').click();
  await expect(guide(page)).toHaveCount(0);
  await expect.poll(() => saved(page)).toMatchObject({ setupGuideSeen: true, keySound: true, audioSetup: 'speakers', sight: { level: 1, hands: 'rh' } });
  await expect(page.locator('.kb-sound')).toHaveAttribute('aria-pressed', 'true');
});

test('A piano plugged in while the guide is open is found; the top-bar chip opens the guide again', async ({ page }) => {
  await openNew(page, unpluggedMidi);
  await expect(guide(page)).toContainText('No piano found yet');
  await expect(guide(page)).toContainText('USB');
  await expect(guide(page)).toContainText('Audio MIDI Setup');
  await expect(button(page, 'Next')).toBeDisabled();

  await button(page, 'Skip setup').click();
  await expect(guide(page)).toHaveCount(0);
  const chip = page.locator('.chip-midi');
  await expect(chip).toHaveText('Connect a piano');
  await chip.click();
  await expect(guide(page)).toContainText('Connect your piano');

  await page.evaluate(() => (window as unknown as { __plug(): void }).__plug());
  await expect(guide(page)).toContainText('Found Test Piano');
  await expect(button(page, 'Next')).toBeEnabled();
});

test('Changing one skill changes only the lessons it covers', async ({ page }) => {
  await openNew(page);
  await button(page, 'Next').click();
  const beginner = guide(page).getByRole('radio', { name: /Beginner/ });
  await beginner.click();
  await expect(beginner).toHaveAttribute('aria-checked', 'true');
  await guide(page).getByLabel('Playing by ear').selectOption({ label: 'I can pick out intervals and chords' });
  // No longer the preset of any stage.
  await expect(guide(page).getByRole('radio', { checked: true })).toHaveCount(0);
  await button(page, 'Next').click();
  await button(page, 'Start practising').click();
  await expect.poll(() => saved(page)).toMatchObject({
    experience: { reading: 1, ear: 5, technique: 0 },
    sight: { level: 10, hands: 'rh' },
    rhythm: { level: 1 },
    ear: { level: 61 },
    scales: { octaves: 1 },
  });
});

test('Skip setup leaves the defaults and does not come back', async ({ page }) => {
  await openNew(page);
  await button(page, 'Next').click();
  await guide(page).getByRole('radio', { name: /Advanced/ }).click();
  await button(page, 'Skip setup').click();
  await expect(guide(page)).toHaveCount(0);
  await expect.poll(() => saved(page)).toMatchObject({ setupGuideSeen: true, experience: null, keySound: false, audioSetup: 'speakers', sight: { level: 1, hands: 'rh' } });
  await page.reload();
  await page.waitForFunction(() => !!window.__ppDebug?.exercise);
  await expect(page.locator('.chip-midi')).toHaveClass(/is-on/);
  await expect(guide(page)).toHaveCount(0);
});

test('Calibrate now opens the calibration and comes back to the metronome step', async ({ page }) => {
  await openNew(page);
  await button(page, 'Next').click();
  await button(page, 'Next').click();
  await button(page, /Calibrate now/).click();
  await expect(guide(page)).toHaveCount(1);
  await expect(guide(page)).toContainText('Latency calibration');
  await button(page, 'Cancel').click();
  await expect(guide(page)).toContainText('Line up the metronome');
  await expect(guide(page)).toContainText('step 3 of 3');
});

test('Reopened from Input & audio, the guide changes nothing unless something is picked', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight', sight: { level: 30, hands: 'lh' }, audioSetup: 'headphones', latencyMs: 180 } });
  await expect(guide(page)).toHaveCount(0);
  await app.openTab('Input & audio');
  await page.getByRole('button', { name: 'Setup guide…' }).click();
  await expect(guide(page)).toContainText('Connect your piano');
  await button(page, 'Next').click();
  await expect(guide(page).getByRole('radio', { checked: true })).toHaveCount(0);
  await button(page, 'Next').click();
  await expect(button(page, /Headphones on piano/)).toHaveAttribute('aria-pressed', 'true');
  await button(page, 'Start practising').click();
  await expect(guide(page)).toHaveCount(0);
  await page.waitForTimeout(500); // past the debounced save
  expect(await app.savedSettings()).toMatchObject({ sight: { level: 30, hands: 'lh' }, experience: null, audioSetup: 'headphones', latencyMs: 180 });
});

for (const theme of ['light', 'dark'] as const) {
  test(`Every step fits a 360 px phone (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.addInitScript((t) => {
      const key = 'practice-piano:users/local-test/settings';
      localStorage.setItem('practice-piano:identity/local-id', 'local-test');
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ theme: t }));
    }, theme);
    await openNew(page, unpluggedMidi);
    const fits = async (what: string) => {
      const card = page.locator('.modal-card.setup');
      expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${what}: card overflows sideways`).toBe(true);
      const box = (await card.boundingBox())!;
      expect(box.x, what).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, what).toBeLessThanOrEqual(360);
      expect(box.y + box.height, `${what}: card is taller than the screen`).toBeLessThanOrEqual(640);
      const clipped = await card.locator('.btn').evaluateAll((bs) => bs.some((b) => b.scrollWidth > b.clientWidth + 1));
      expect(clipped, `${what}: a button label is clipped`).toBe(false);
    };
    await fits('connect, nothing found');
    await button(page, 'I don’t have a piano here').click();
    await fits('without a piano');
    await button(page, 'Back').click();
    await page.evaluate(() => (window as unknown as { __plug(): void }).__plug());
    await expect(guide(page)).toContainText('Found Test Piano');
    await fits('connect, piano found');
    await button(page, 'Next').click();
    await guide(page).getByRole('radio', { name: /Intermediate/ }).click();
    await fits('level');
    await button(page, 'Next').click();
    await fits('metronome');
  });
}
