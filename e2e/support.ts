import { test as base, expect, type Page } from '@playwright/test';

/**
 * Test support: a fake Web MIDI piano, seeded storage and helpers to play the current
 * exercise. Everything goes through the same input path as a real keyboard (Web MIDI
 * messages with timestamps), so the tests exercise the real engines and UI.
 */

type Json = Record<string, unknown>;

export interface Seed {
  settings?: Json;
  progress?: Json;
}

/** What the dev build exposes on window.__ppDebug (see App.tsx). */
export interface DebugStep {
  tick: number;
  midis: number[];
  measureIndex: number;
}

declare global {
  interface Window {
    __midi(data: number[], timeStamp?: number): void;
    __schedule(data: number[], at: number): void;
    __ppDebug?: {
      // Kept loose on purpose: tests read a few fields of whatever the lesson builds.
      exercise: Json & { steps: DebugStep[]; bpm: number };
      controller: { playheadTick(now?: number): number | null; state: { get(): Json } };
    };
  }
}

/** Installs a Web MIDI implementation with one connected input ("Test Piano"). */
function fakeMidi() {
  const input = { id: 'fake1', name: 'Test Piano', manufacturer: 'Test', state: 'connected', onmidimessage: null as null | ((e: unknown) => void) };
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    configurable: true,
    value: async () => ({ inputs: new Map([['fake1', input]]), outputs: new Map(), onstatechange: null }),
  });
  window.__midi = (data, ts) => input.onmidimessage?.({ data: new Uint8Array(data), timeStamp: ts ?? performance.now() });
  window.__schedule = (data, at) => setTimeout(() => window.__midi(data, at), Math.max(0, at - performance.now()));
}

/** Seeds one local profile's settings and progress before the app loads. */
function seedStorage(seed: { settings: string; progress: string | null }) {
  // Only on the first load of a page, so a reload in a test sees what the app saved.
  if (sessionStorage.getItem('pp-e2e-seeded')) return;
  sessionStorage.setItem('pp-e2e-seeded', '1');
  localStorage.clear();
  localStorage.setItem('practice-piano:identity/local-id', 'local-test');
  localStorage.setItem('practice-piano:users/local-test/settings', seed.settings);
  if (seed.progress) localStorage.setItem('practice-piano:users/local-test/progress', seed.progress);
}

/** Settings every test starts from: no latency compensation, so scheduled notes land where meant. */
const BASE_SETTINGS: Json = { latencyMs: 0, playheadDelayMs: 0, pianoShortcuts: true };

export class App {
  readonly errors: string[] = [];

  constructor(readonly page: Page) {
    page.on('pageerror', (e) => this.errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') this.errors.push(m.text());
    });
  }

  async open(seed: Seed = {}): Promise<void> {
    await this.page.addInitScript(fakeMidi);
    await this.page.addInitScript(seedStorage, {
      settings: JSON.stringify({ ...BASE_SETTINGS, ...seed.settings }),
      progress: seed.progress ? JSON.stringify(seed.progress) : null,
    });
    await this.page.goto('/');
    await this.page.waitForFunction(() => !!window.__ppDebug?.exercise);
    // MIDI access resolves asynchronously; the chip shows the device once it is attached.
    await expect(this.page.locator('.chip-midi')).toHaveClass(/is-on/);
  }

  /** Reads from the current exercise (runs in the page). */
  exercise<T>(fn: (ex: Json & { steps: DebugStep[]; bpm: number }) => T): Promise<T> {
    return this.page.evaluate(`(${fn.toString()})(window.__ppDebug.exercise)`) as Promise<T>;
  }

  status(): Promise<string> {
    return this.page.evaluate(() => window.__ppDebug!.controller.state.get().status as string);
  }

  /** The expected keys of each step of the current exercise. */
  steps(): Promise<number[][]> {
    return this.page.evaluate(() => window.__ppDebug!.exercise.steps.map((s) => s.midis));
  }

  async noteOn(keys: readonly number[], velocity = 72): Promise<void> {
    await this.page.evaluate(([ks, v]) => ks.forEach((k) => window.__midi([0x90, k, v])), [keys, velocity] as const);
  }

  async noteOff(keys: readonly number[]): Promise<void> {
    await this.page.evaluate((ks) => ks.forEach((k) => window.__midi([0x80, k, 0])), keys);
  }

  /** Press and release keys together. */
  async tap(keys: readonly number[]): Promise<void> {
    await this.noteOn(keys);
    await this.noteOff(keys);
  }

  /** Wait mode: play every step in order, optionally one wrong key before step `wrongAt`. */
  async playSteps(opts: { wrongAt?: number; pauseMs?: number } = {}): Promise<void> {
    const steps = await this.steps();
    for (let i = 0; i < steps.length; i++) {
      if (i === opts.wrongAt) await this.tap([wrongKey(steps[i])]);
      await this.tap(steps[i]);
      if (opts.pauseMs) await this.page.waitForTimeout(opts.pauseMs);
    }
  }

  /**
   * Flow mode: start the count-in and measure the clock from the playhead (two samples,
   * so it works for every lesson's controller).
   */
  async startFlow(): Promise<{ t0: number; msPerTick: number }> {
    await this.page.keyboard.press('Space');
    await this.page.waitForFunction(() => window.__ppDebug!.controller.playheadTick() !== null);
    return this.page.evaluate(async () => {
      const c = window.__ppDebug!.controller;
      const a = performance.now();
      const ta = c.playheadTick(a)!;
      await new Promise((r) => setTimeout(r, 60));
      const b = performance.now();
      const tb = c.playheadTick(b)!;
      const msPerTick = (b - a) / (tb - ta);
      return { t0: a - ta * msPerTick, msPerTick };
    });
  }

  /** Flow mode: schedule notes at tick positions (ms offsets added), released after `holdMs`. */
  async schedule(notes: { tick: number; keys: number[]; offsetMs?: number; holdMs?: number }[], clock: { t0: number; msPerTick: number }): Promise<void> {
    const events = notes.flatMap((n) => {
      const at = clock.t0 + n.tick * clock.msPerTick + (n.offsetMs ?? 0);
      const off = at + (n.holdMs ?? 120);
      return n.keys.flatMap((k) => [
        { data: [0x90, k, 72], at },
        { data: [0x80, k, 0], at: off },
      ]);
    });
    await this.page.evaluate((evs) => evs.forEach((e) => window.__schedule(e.data, e.at)), events);
  }

  /** Flow mode: play every step on time (± a few ms). */
  async playFlow(opts: { jitterMs?: number; skipBars?: readonly number[] } = {}): Promise<{ t0: number; msPerTick: number; endMs: number }> {
    const all = await this.page.evaluate(() => window.__ppDebug!.exercise.steps.map((s) => ({ tick: s.tick, midis: s.midis, bar: s.measureIndex })));
    const steps = all.filter((s) => !opts.skipBars?.includes(s.bar));
    const clock = await this.startFlow();
    let seed = 7;
    const jitter = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return ((seed / 233280) * 2 - 1) * (opts.jitterMs ?? 6);
    };
    await this.schedule(
      steps.map((s) => ({ tick: s.tick, keys: s.midis, offsetMs: jitter() })),
      clock,
    );
    const last = all[all.length - 1]?.tick ?? 0;
    return { ...clock, endMs: clock.t0 + last * clock.msPerTick };
  }

  /** Waits until the page's clock passes `at` (performance.now() time). */
  async waitUntil(at: number): Promise<void> {
    const now = await this.page.evaluate(() => performance.now());
    if (at > now) await this.page.waitForTimeout(at - now);
  }

  results() {
    return this.page.locator('.results-card');
  }

  async openTab(name: 'Exercise' | 'Input & audio' | 'Progress'): Promise<void> {
    await this.page.getByRole('tab', { name }).click();
  }

  /** The lesson switcher in the top bar (short or long label). */
  async switchLesson(name: RegExp): Promise<void> {
    await this.page.locator('.topbar-lesson').getByRole('radio', { name }).click();
  }

  /** Saved settings of the test profile. */
  savedSettings(): Promise<Json> {
    return this.page.evaluate(() => JSON.parse(localStorage.getItem('practice-piano:users/local-test/settings') ?? '{}'));
  }

  savedProgress(): Promise<Json> {
    return this.page.evaluate(() => JSON.parse(localStorage.getItem('practice-piano:users/local-test/progress') ?? '{}'));
  }
}

const DAY = 86_400_000;

/** A repertoire item on the ladder at `tempo`, due `dueInDays` from now (negative = overdue). */
export function repertoireItem(tempo: number, dueInDays: number): Json {
  const now = Date.now();
  return {
    attempts: 2,
    cleanRuns: 1,
    ladderTempo: tempo,
    bestCleanTempo: tempo,
    box: 1,
    dueAt: now + dueInDays * DAY,
    lastAt: now - 2 * DAY,
    accuracy: 0.9,
    mastered: false,
  };
}

/** A saved progress state holding these repertoire items. */
export function progressWith(repertoire: Record<string, Json>): Json {
  return {
    schemaVersion: 1,
    xp: 0,
    exercisesCompleted: 1,
    streak: { current: 0, best: 0, lastDay: null },
    days: {},
    tiers: {},
    stats: {},
    attempts: {},
    history: [],
    repertoire,
  };
}

/** A key that is not part of the chord or note group. */
export function wrongKey(keys: readonly number[]): number {
  const pcs = new Set(keys.map((k) => k % 12));
  const base = keys[0] ?? 60;
  for (let d = 1; d < 12; d++) if (!pcs.has((base + d) % 12)) return base + d;
  return base + 1;
}

export const test = base.extend<{ app: App }>({
  app: async ({ page }, use) => {
    const app = new App(page);
    await use(app);
    expect(app.errors, 'no page errors or console errors').toEqual([]);
  },
});

export { expect };
