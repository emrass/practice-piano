import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';

/**
 * Helpers for the landing-page screenshots: output folder, seeded randomness, the saved
 * progress fixture, cropping to the final image's aspect ratio and the PNG → WebP step.
 */

type Json = Record<string, unknown>;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

/** Where the .webp files go: $SCREENSHOT_OUT, or the site repository next to this one. */
export const OUT_DIR = process.env.SCREENSHOT_OUT ? path.resolve(process.env.SCREENSHOT_OUT) : path.resolve(REPO, '../practice-piano-site/img');

const DAY = 86_400_000;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + days));
}

/**
 * A realistic saved progress (a few weeks of practice in every lesson), moved in time so its
 * last session was an hour ago: the streak is current, and the scales are due or come back
 * for review in a few days, as they did when the fixture was recorded.
 */
export function progressFixture(now = Date.now()): Json {
  const p = JSON.parse(readFileSync(path.join(HERE, 'progress-fixture.json'), 'utf8')) as {
    streak: { lastDay: string | null };
    days: Record<string, unknown>;
    tiers: Record<string, { masteredAt?: number }>;
    history: { at: number }[];
    repertoire: Record<string, { dueAt: number; lastAt: number }>;
  };
  const items = Object.values(p.repertoire);
  const last = Math.max(...items.map((it) => it.lastAt), ...p.history.map((h) => h.at));
  const shift = now - 3_600_000 - last;
  // Calendar days: the last practice day becomes today.
  const lastDay = p.streak.lastDay ?? dayKey(new Date(last));
  const [y, m, d] = lastDay.split('-').map(Number);
  const today = new Date(now);
  const dayShift = Math.round((new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() - new Date(y, m - 1, d).getTime()) / DAY);

  for (const it of items) {
    it.dueAt += shift;
    it.lastAt += shift;
  }
  for (const h of p.history) h.at += shift;
  for (const t of Object.values(p.tiers)) if (typeof t.masteredAt === 'number') t.masteredAt += shift;
  p.days = Object.fromEntries(Object.entries(p.days).map(([k, v]) => [shiftDayKey(k, dayShift), v]));
  if (p.streak.lastDay) p.streak.lastDay = shiftDayKey(p.streak.lastDay, dayShift);
  return p as unknown as Json;
}

/** A small seeded PRNG (mulberry32), for the note timing jitter on the test side. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    /** Uniform in [lo, hi). */
    uniform: (lo: number, hi: number) => lo + (hi - lo) * next(),
    /** Integer in [lo, hi]. */
    int: (lo: number, hi: number) => lo + Math.floor((hi - lo + 1) * next()),
    /** Normal distribution (Box–Muller). */
    gauss: (mean: number, sd: number) => mean + sd * Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()),
  };
}

/**
 * Replaces the page's Math.random with a seeded generator before the app loads. The app draws
 * its exercise seeds from Math.random, so the same seed gives the same exercises every time.
 */
export async function seedPageRandom(page: Page, seed: number): Promise<void> {
  await page.addInitScript((s: number) => {
    let a = s >>> 0;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, seed);
}

/** A note to send through the fake MIDI input at a page clock time (performance.now()). */
export interface MidiNote {
  midi: number;
  at: number;
  velocity: number;
  /** Release time (page clock). */
  off: number;
}

export async function scheduleNotes(page: Page, notes: readonly MidiNote[]): Promise<void> {
  await page.evaluate((ns) => {
    for (const n of ns) {
      window.__schedule([0x90, n.midi, n.velocity], n.at);
      window.__schedule([0x80, n.midi, 0], n.off);
    }
  }, notes);
}

export interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The element's box (or a given box) from its top, cut or extended downwards to the final
 * image's aspect ratio. `top` moves the top edge down (positive) or up (negative); `pad` widens
 * the box on every side.
 */
export async function clipTo(target: Locator | Clip, size: { width: number; height: number }, opts: { top?: number; pad?: number } = {}): Promise<Clip> {
  const box = 'boundingBox' in target ? await target.first().boundingBox() : target;
  if (!box) throw new Error('element to crop is not visible');
  const pad = opts.pad ?? 0;
  const x = box.x - pad;
  const width = box.width + 2 * pad;
  const y = box.y - pad + (opts.top ?? 0);
  return { x, y, width, height: (width * size.height) / size.width };
}

/**
 * Screenshots `clip` (CSS pixels, at the page's device pixel ratio), scales it to exactly
 * `size` and writes OUT_DIR/<name>.webp. There is no image library here: the browser converts
 * it on a canvas (`toDataURL('image/webp', 0.82)`).
 */
export async function saveShot(page: Page, name: string, clip: Clip, size: { width: number; height: number }): Promise<string> {
  const png = await page.screenshot({ clip, animations: 'disabled', caret: 'hide' });
  const webp = await toWebp(page, png, size);
  mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${name}.webp`);
  writeFileSync(file, webp);
  return file;
}

async function toWebp(page: Page, png: Buffer, size: { width: number; height: number }): Promise<Buffer> {
  const conv = await page.context().newPage();
  try {
    const dataUrl = await conv.evaluate(
      async ({ src, width, height }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        // Halve first while the image is more than twice the target: smoother than one big step.
        let source: CanvasImageSource = img;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        while (w >= width * 2 && h >= height * 2) {
          const half = document.createElement('canvas');
          half.width = Math.round(w / 2);
          half.height = Math.round(h / 2);
          const hc = half.getContext('2d')!;
          hc.imageSmoothingQuality = 'high';
          hc.drawImage(source, 0, 0, half.width, half.height);
          source = half;
          w = half.width;
          h = half.height;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, 0, 0, width, height);
        return canvas.toDataURL('image/webp', 0.82);
      },
      { src: `data:image/png;base64,${png.toString('base64')}`, ...size },
    );
    if (!dataUrl.startsWith('data:image/webp;base64,')) throw new Error('this browser cannot encode WebP');
    return Buffer.from(dataUrl.slice('data:image/webp;base64,'.length), 'base64');
  } finally {
    await conv.close();
  }
}
