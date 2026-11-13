import type { Page } from '@playwright/test';
import { type App, expect, test } from '../../e2e/support';
import { clipTo, type MidiNote, progressFixture, rng, saveShot, scheduleNotes, seedPageRandom } from './shots';

/**
 * Landing-page screenshots (practice-piano-site/img). Each test stages one shot (or a group
 * taken from the same run) in the real app, played through the fake MIDI piano, and writes
 * the .webp at the size the site uses. Run one with `npm run screenshots -- -g <file name>`.
 *
 * Deterministic: the page's Math.random is seeded (so the app generates the same exercises
 * every run) and so is the note timing jitter played here. What still varies by a few ms is
 * real-time scheduling, so timing numbers in result cards can differ in the last digit.
 */

type Json = Record<string, unknown>;
type Size = { width: number; height: number };

const size = (width: number, height: number): Size => ({ width, height });

async function open(app: App, page: Page, settings: Json, opts: { seed: number; progress?: boolean }): Promise<void> {
  await seedPageRandom(page, opts.seed);
  await app.open({ settings: { countInBars: 1, ...settings }, progress: opts.progress === false ? undefined : progressFixture() });
  // Fonts and the engraved score settle after the first frames.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

interface FlowNote {
  tick: number;
  midi: number;
  hand: string;
  durationTicks: number;
  bar: number;
  finger: number | null;
}

/** The current exercise's notes in playing order, with their bar and printed finger. */
function flowNotes(page: Page): Promise<{ notes: FlowNote[]; callBars: number[]; mutedBars: number[]; lastTick: number }> {
  return page.evaluate(() => {
    const ex = window.__ppDebug!.exercise as unknown as {
      steps: { tick: number; measureIndex: number; notes: { eventId: string; hand: string; midi: number; durationTicks: number }[] }[];
      measures: { rh: { id: string; fingers?: number[] }[]; lh: { id: string; fingers?: number[] }[] }[];
      rhythm?: { callBars: number[]; mutedBars: number[] };
    };
    const fingers = new Map(ex.measures.flatMap((m) => [...m.rh, ...m.lh]).map((e) => [e.id, e.fingers?.[0] ?? null]));
    const notes = ex.steps.flatMap((s) => {
      const seen = new Set<number>();
      return s.notes
        .filter((n) => !seen.has(n.midi) && seen.add(n.midi))
        .map((n) => ({ tick: s.tick, midi: n.midi, hand: n.hand, durationTicks: n.durationTicks, bar: s.measureIndex, finger: fingers.get(n.eventId) ?? null }));
    });
    return { notes, callBars: ex.rhythm?.callBars ?? [], mutedBars: ex.rhythm?.mutedBars ?? [], lastTick: ex.steps[ex.steps.length - 1]?.tick ?? 0 };
  });
}

/**
 * Flow mode: start the count-in and play every note with human-ish timing (seeded): a normal
 * spread around a few ms late, optional misses, and for scales a late thumb after finger 3
 * (the thumb-under bump) and a heavier thumb.
 */
async function playFlow(
  app: App,
  page: Page,
  opts: { seed: number; jitterMs: number; thumbBumpMs?: number; heavyThumb?: boolean; miss?: number; release?: number },
): Promise<{ t0: number; msPerTick: number; endMs: number }> {
  const r = rng(opts.seed);
  const { notes, callBars, lastTick } = await flowNotes(page);
  const clock = await app.startFlow();
  const prevFinger = new Map<string, number | null>();
  const out: MidiNote[] = [];
  for (const n of notes) {
    if (callBars.includes(n.bar)) continue;
    const late = opts.thumbBumpMs && n.finger === 1 && prevFinger.get(n.hand) === 3 ? opts.thumbBumpMs : 0;
    prevFinger.set(n.hand, n.finger);
    if (r.next() < (opts.miss ?? 0)) continue;
    const velocity = (opts.heavyThumb && n.finger === 1 ? 92 : 66) + r.int(-5, 5);
    const at = clock.t0 + n.tick * clock.msPerTick + r.gauss(6, opts.jitterMs) + late;
    out.push({ midi: n.midi, at, velocity, off: at + Math.max(120, n.durationTicks * clock.msPerTick * (opts.release ?? 0.85)) });
  }
  await scheduleNotes(page, out);
  return { ...clock, endMs: clock.t0 + lastTick * clock.msPerTick };
}

/** Wait mode: play the first `count` steps, a short pause after each. */
async function playSteps(app: App, page: Page, count: number, pauseMs: number): Promise<number[][]> {
  const steps = await app.steps();
  for (const keys of steps.slice(0, count)) {
    await app.tap(keys);
    await page.waitForTimeout(pauseMs);
  }
  return steps;
}

const stage = (page: Page) => page.locator('.stage');

/**
 * Presses N (new exercise) until the exercise fits the shot. With the seeded Math.random the
 * sequence of exercises is the same every run, so this always stops at the same one.
 */
async function nextExerciseUntil(app: App, page: Page, fits: () => Promise<boolean>, tries = 60): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (await fits()) return;
    const id = await app.exercise((ex) => ex.id);
    await page.keyboard.press('KeyN');
    await page.waitForFunction((prev) => window.__ppDebug!.exercise.id !== prev, id);
  }
  throw new Error(`no exercise fitted the shot in ${tries} tries`);
}

/** The sidebar from just above a section's title, cut to the image's aspect ratio. */
async function sidebarFrom(page: Page, title: string, s: Size) {
  const sidebar = (await page.locator('.sidebar').boundingBox())!;
  const head = (await page.locator('.panel-section .section-title').filter({ hasText: title }).first().boundingBox())!;
  return clipTo({ x: sidebar.x, y: head.y - 1, width: sidebar.width, height: 0 }, s);
}

test.describe('desktop 1440×900 @2x', () => {
  test('hero-scale.webp, scales-feedback.webp', async ({ app, page }) => {
    // D major, two octaves, hands together on the tempo ladder (64 bpm in the fixture).
    await open(app, page, { lesson: 'scales', scales: { mode: 'flow', type: 'major', tonic: 'D', hands: 'together', octaves: 2, noteValue: 'eighth' } }, { seed: 1 });
    const run = await playFlow(app, page, { seed: 4, jitterMs: 10, thumbBumpMs: 48, heavyThumb: true });
    await app.waitUntil(run.endMs + 1500);
    const card = page.locator('.results-card');
    await expect(card).toContainText('Tempo up');
    await saveShot(page, 'scales-feedback', await clipTo(card, size(960, 661)), size(960, 661));
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
    await page.waitForTimeout(300);
    await saveShot(page, 'hero-scale', await clipTo(page.locator('.score-card'), size(2000, 461)), size(2000, 461));
  });

  test('sight-flow.webp, shortcuts.webp', async ({ app, page }) => {
    await open(app, page, { lesson: 'sight', sight: { mode: 'flow', level: 44, hands: 'both', bars: 8 } }, { seed: 2 });
    const run = await playFlow(app, page, { seed: 5, jitterMs: 22, miss: 0.03 });
    await app.waitUntil(run.t0 + (run.endMs - run.t0) * 0.45);
    await saveShot(page, 'sight-flow', await clipTo(stage(page), size(1800, 1388)), size(1800, 1388));
    await app.waitUntil(run.endMs + 1500);
    await expect(app.results()).toBeVisible();
    // Results closed: the piano still shows the shortcut labels until the next exercise.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await saveShot(page, 'shortcuts', await clipTo(page.locator('.keyboard-dock'), size(1600, 294)), size(1600, 294));
  });

  test('dark.webp', async ({ app, page }) => {
    await open(app, page, { lesson: 'sight', theme: 'dark', sight: { mode: 'wait', level: 12, hands: 'rh', bars: 4 } }, { seed: 3 });
    // A passage with enough notes that five played ones leave most of it to read.
    await nextExerciseUntil(app, page, async () => (await app.steps()).length >= 9);
    const steps = await playSteps(app, page, 5, 120);
    // Hold the next note: it shows on the keyboard and the input monitor.
    await app.noteOn([steps[5][0]]);
    await page.waitForTimeout(250);
    await saveShot(page, 'dark', await clipTo(stage(page), size(1800, 1388)), size(1800, 1388));
  });

  test('ear.webp', async ({ app, page }) => {
    await open(app, page, { lesson: 'ear', ear: { level: 26 } }, { seed: 4 });
    const total = await app.exercise((ex) => (ex.ear as { totalMs: number }).totalMs);
    await page.keyboard.press('Space');
    await page.waitForTimeout(total + 400);
    const steps = await playSteps(app, page, 3, 150);
    // A wrong key a step above (a white one), held: "Not that one — try again".
    const target = steps[3][0];
    await app.noteOn([[1, 3, 6, 8, 10].includes((target + 2) % 12) ? target + 1 : target + 2]);
    await page.waitForTimeout(60);
    await saveShot(page, 'ear', await clipTo(stage(page), size(1800, 1388)), size(1800, 1388));
  });

  test('rhythm-hands.webp', async ({ app, page }) => {
    await open(app, page, { lesson: 'rhythm', rhythm: { level: 64, task: 'read', hands: 'both', texture: 'interlock', bars: 4, timeSignature: '4/4' } }, { seed: 5 });
    // A busy first line (bars 1–2), so the hands visibly alternate in sixteenths.
    await nextExerciseUntil(app, page, () => app.exercise((ex) => ex.steps.filter((s) => s.measureIndex < 2).length >= 24));
    const run = await playFlow(app, page, { seed: 6, jitterMs: 16 });
    await app.waitUntil(run.t0 + (run.endMs - run.t0) * 0.4);
    await saveShot(page, 'rhythm-hands', await clipTo(page.locator('.score-card'), size(2000, 446)), size(2000, 446));
  });

  test('rhythm-pulse.webp', async ({ app, page }) => {
    await open(app, page, { lesson: 'rhythm', rhythm: { level: 34, task: 'pulse', hands: 'rh', bars: 8, timeSignature: '4/4' } }, { seed: 6 });
    const r = rng(7);
    const { notes, mutedBars, lastTick } = await flowNotes(page);
    const clock = await app.startFlow();
    // On the click it is fine; in the silent bars the player rushes a little more each beat.
    let drift = 0;
    const out = notes.map((n): MidiNote => {
      drift = mutedBars.includes(n.bar) ? drift - 9 : 0;
      const at = clock.t0 + n.tick * clock.msPerTick + r.gauss(4, 12) + drift;
      return { midi: n.midi, at, velocity: 80, off: at + 150 };
    });
    await scheduleNotes(page, out);
    await app.waitUntil(clock.t0 + lastTick * clock.msPerTick + 1500);
    await expect(app.results()).toContainText('Drift');
    await saveShot(page, 'rhythm-pulse', await clipTo(app.results(), size(960, 400)), size(960, 400));
  });

  test('chords-flow.webp, chords-results.webp', async ({ app, page }) => {
    await open(
      app,
      page,
      { lesson: 'chords', chords: { task: 'progression', progression: 'I-V-vi-IV', key: 'Eb', hands: 'lh-bass', mode: 'flow', notation: true, goalBpm: 80 } },
      { seed: 7 },
    );
    const targets = await app.exercise((ex) => (ex.chords as { targets: { voicing: number[]; bassMidi: number | null }[] }).targets);
    const tpb = await app.exercise((ex) => (ex.timeSignature as { ticksPerBar: number }).ticksPerBar);
    const clock = await app.startFlow();
    const bar = tpb * clock.msPerTick;
    const r = rng(7);
    // Chord 4 a little late, chord 6 rolled (keys 55 ms apart), chord 7 taken an inversion
    // too high (the hand jumps instead of moving to the nearest chord tones).
    const late = new Set([3]);
    const rolled = new Set([5]);
    const jump = new Set([6]);
    const out: MidiNote[] = [];
    targets.forEach((t, i) => {
      let rh = t.voicing;
      if (jump.has(i)) rh = [...rh.slice(1), rh[0] + 12].sort((a, b) => a - b);
      const keys = [...(t.bassMidi !== null ? [t.bassMidi] : []), ...rh];
      const base = clock.t0 + i * bar + r.gauss(-4, 12) + (late.has(i) ? 110 : 0);
      keys.forEach((midi, j) => {
        const at = base + (rolled.has(i) ? j * 55 : r.uniform(0, 18));
        out.push({ midi, at, velocity: 70 + r.int(-6, 6), off: clock.t0 + (i + 1) * bar - 60 });
      });
    });
    await scheduleNotes(page, out);
    await app.waitUntil(clock.t0 + bar * 2.55);
    await saveShot(page, 'chords-flow', await clipTo(stage(page), size(1800, 1378)), size(1800, 1378));
    await app.waitUntil(clock.t0 + bar * targets.length + 1200);
    await expect(app.results()).toContainText('Voice leading');
    await saveShot(page, 'chords-results', await clipTo(app.results(), size(960, 622)), size(960, 622));
  });

  test('progress-sight.webp, progress-scales.webp', async ({ app, page }) => {
    await open(app, page, { lesson: 'sight' }, { seed: 8 });
    await app.openTab('Progress');
    await page.waitForTimeout(300);
    await saveShot(page, 'progress-sight', await sidebarFrom(page, 'Weak spots', size(680, 940)), size(680, 940));

    await app.switchLesson(/scales/i);
    await page.waitForTimeout(300);
    await saveShot(page, 'progress-scales', await sidebarFrom(page, 'Your scales', size(680, 880)), size(680, 880));
  });
});

test.describe('desktop 1440×1300 @2x', () => {
  test.use({ viewport: { width: 1440, height: 1300 } });

  test('progress-rhythm.webp', async ({ app, page }) => {
    await open(app, page, { lesson: 'rhythm' }, { seed: 9 });
    await app.openTab('Progress');
    await page.waitForTimeout(300);
    await saveShot(page, 'progress-rhythm', await clipTo(page.locator('.sidebar'), size(680, 1640)), size(680, 1640));
  });
});

test.describe('iPad landscape 1180×820 @2x', () => {
  test.use({ viewport: { width: 1180, height: 820 } });

  test('ipad-scales.webp', async ({ app, page }) => {
    await open(app, page, { lesson: 'scales', scales: { mode: 'wait', type: 'harmonic-minor', tonic: 'A', hands: 'together', octaves: 1 } }, { seed: 10 });
    await playSteps(app, page, 6, 100);
    await saveShot(page, 'ipad-scales', await clipTo(stage(page), size(1664, 1524)), size(1664, 1524));
  });
});
