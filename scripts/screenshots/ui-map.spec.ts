import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type App, expect, test } from '../../e2e/support';
import { progressFixture, seedPageRandom } from './shots';

/**
 * The UI map in docs/ui-map/ (see docs/ui-map.md): one screenshot of the app in sight reading,
 * Wait mode, a few notes in, drawn over twice. `ui-map-areas.png` outlines the shell regions
 * and stage cards named in design/system/guides/02-layout.md; `ui-map-parts.png` numbers the
 * parts inside them, with a legend. Run with `npm run ui-map` after a layout change, and keep
 * the glossary in docs/ui-map.md in step with PARTS below.
 *
 * The overlay is a throwaway HTML page rendered by the same browser, so it never touches the
 * app's styles. Its colors are fixed annotation colors, not design tokens: the map is a
 * document about the app, not part of it.
 */

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/ui-map');

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Part {
  name: string;
  sel: string;
  note?: string;
}

interface Area {
  name: string;
  color: string;
  sel: string;
  parts: Part[];
}

/** In legend order; the numbers in the parts image follow it. */
const AREAS: Area[] = [
  {
    name: 'Top bar',
    color: '#d9480f',
    sel: '.topbar',
    parts: [
      { name: 'Logo', sel: '.topbar .logo' },
      { name: 'Lesson switcher', sel: '.topbar-lesson', note: 'Picks the lesson' },
      { name: 'Mode switch', sel: '.topbar-mode', note: 'Wait or Flow' },
      { name: 'Streak chip', sel: '.chip-streak', note: 'Daily practice streak' },
      { name: 'XP chip', sel: '.chip-xp', note: 'Experience points' },
      { name: 'Piano chip', sel: '.chip-midi', note: 'MIDI status, opens Piano & audio' },
      { name: 'Theme toggle', sel: '.topbar-right .icon-btn:not(.drawer-toggle)', note: 'Light or dark' },
    ],
  },
  {
    name: 'Sidebar',
    color: '#5f3dc4',
    sel: '.sidebar',
    parts: [
      { name: 'Sidebar tabs', sel: '.sidebar [role=tablist]', note: 'Exercise and Progress' },
      { name: 'Exercise panel', sel: '.sidebar-scroll', note: 'Settings for the lesson' },
    ],
  },
  {
    name: 'Meta strip',
    color: '#1971c2',
    sel: '.meta-strip',
    parts: [
      { name: 'Level and tier', sel: '.meta-lead' },
      { name: 'Exercise stats', sel: '.meta-strip > .stat', note: 'Facts of this exercise' },
      { name: 'Badges', sel: '.meta-badges' },
    ],
  },
  {
    name: 'Score',
    color: '#2b8a3e',
    sel: '.stage > .score',
    parts: [
      { name: 'Staff', sel: '.score-host > svg', note: 'The engraved exercise' },
      { name: 'Cursor', sel: '.score-cursor', note: 'The step to play now (Wait)' },
    ],
  },
  {
    name: 'Practice bar',
    color: '#c2255c',
    sel: '.practice-bar',
    parts: [
      { name: 'Practice actions', sel: '.practice-actions', note: 'Start, hint, restart, next' },
      { name: 'Beat dots', sel: '.beat-dots', note: 'Count-in and beat' },
      { name: 'Practice message', sel: '.practice-message', note: 'What to do now' },
      { name: 'Practice stats', sel: '.practice-stats', note: 'Live numbers for this run' },
    ],
  },
  {
    name: 'Keyboard',
    color: '#e67700',
    sel: '.stage > .keyboard',
    parts: [
      { name: 'Input monitor', sel: '.keyboard-head > .keyboard-group:first-child', note: 'Pedal and held notes' },
      { name: 'Keyboard tools', sel: '.keyboard-head > .keyboard-group:last-child', note: 'Range, guide, display, key sound' },
      { name: 'Keys', sel: '.stage > .keyboard .keys', note: 'The on-screen piano' },
    ],
  },
];

const STAGE_COLOR = '#495057';
/** The app's viewport (CSS px) and the space around it in the images. */
const W = 1440;
const H = 900;
const MARGIN = 24;
const LEGEND = 560;

/** The box around every visible match of a selector, or null when none is visible. */
function rectOf(page: Page, sel: string): Promise<Rect | null> {
  return page.evaluate((s) => {
    const rs = [...document.querySelectorAll(s)]
      .filter((el) => getComputedStyle(el).visibility !== 'hidden')
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    if (!rs.length) return null;
    const x = Math.min(...rs.map((r) => r.left));
    const y = Math.min(...rs.map((r) => r.top));
    return { x, y, width: Math.max(...rs.map((r) => r.right)) - x, height: Math.max(...rs.map((r) => r.bottom)) - y };
  }, sel);
}

async function mustRect(page: Page, sel: string): Promise<Rect> {
  const r = await rectOf(page, sel);
  if (!r) throw new Error(`UI map: nothing visible for ${sel}`);
  return r;
}

interface Capture {
  png: string;
  stage: Rect;
  /** Free space in the top bar between the mode switch and the chips, for the area's label. */
  topbarGap: { x1: number; x2: number };
  areas: (Area & { rect: Rect; parts: (Part & { rect: Rect })[] })[];
}

async function capture(app: App, page: Page): Promise<Capture> {
  await seedPageRandom(page, 3);
  await app.open({ settings: { lesson: 'sight', sight: { mode: 'wait', level: 12, hands: 'both', bars: 4 } }, progress: progressFixture() });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  // A run in progress: a few steps played and the next one held, so the score, practice bar,
  // input monitor and keys all show something.
  const steps = await app.steps();
  for (const keys of steps.slice(0, 4)) {
    await app.tap(keys);
    await page.waitForTimeout(150);
  }
  await app.noteOn(steps[4]);
  await page.waitForTimeout(400);
  const png = (await page.screenshot({ animations: 'disabled', caret: 'hide' })).toString('base64');

  const areas: Capture['areas'] = [];
  for (const a of AREAS) {
    const parts = [];
    for (const p of a.parts) parts.push({ ...p, rect: await mustRect(page, p.sel) });
    areas.push({ ...a, rect: await mustRect(page, a.sel), parts });
  }
  const mode = await mustRect(page, '.topbar-mode');
  const right = await mustRect(page, '.topbar-right');
  return { png, stage: await mustRect(page, '.stage'), topbarGap: { x1: mode.x + mode.width, x2: right.x }, areas };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const box = (r: Rect) => `left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px`;
const shot = (c: Capture) => `<img src="data:image/png;base64,${c.png}" width="${W}" height="${H}">`;

/** Where an area's label goes: in free space for the top bar and sidebar, else on the top-left corner. */
function labelAt(c: Capture, name: string, r: Rect): string {
  if (name === 'Stage') return `left:${r.x + r.width - 8}px;top:${r.y + r.height - 8}px;transform:translate(-100%,-100%)`;
  if (name === 'Top bar') return `left:${(c.topbarGap.x1 + c.topbarGap.x2) / 2}px;top:${r.y + r.height / 2}px;transform:translate(-50%,-50%)`;
  if (name === 'Sidebar') return `left:${r.x + r.width / 2}px;top:${r.y + r.height - 60}px;transform:translate(-50%,-50%)`;
  return `left:${r.x + 10}px;top:${r.y}px;transform:translateY(-50%)`;
}

function areasHtml(c: Capture): string {
  const all = [{ name: 'Stage', color: STAGE_COLOR, rect: c.stage, dashed: true }, ...c.areas.map((a) => ({ ...a, dashed: false }))];
  const marks = all.map(
    (a) => `<div class="box" style="${box(a.rect)};border:3px ${a.dashed ? 'dashed' : 'solid'} ${a.color};background:${a.color}14"></div>
      <div class="tag" style="${labelAt(c, a.name, a.rect)};background:${a.color}">${esc(a.name)}</div>`,
  );
  return doc(`<div class="frame" style="width:${W}px;height:${H}px;margin:${MARGIN}px">${shot(c)}${marks.join('')}</div>`);
}

function partsHtml(c: Capture): string {
  let n = 0;
  const marks: string[] = [];
  const legend: string[] = [];
  for (const a of c.areas) {
    legend.push(`<div class="group"><h3 style="color:${a.color}"><span class="swatch" style="background:${a.color}"></span>${esc(a.name)}</h3><ol>`);
    for (const p of a.parts) {
      n++;
      // Kept inside the frame: the sidebar and top bar parts touch its edges.
      const x = Math.max(p.rect.x, 6);
      const y = Math.max(p.rect.y, 6);
      const r = { x: x - 2, y: y - 2, width: Math.min(p.rect.width - (x - p.rect.x), W - 6 - x) + 4, height: p.rect.height - (y - p.rect.y) + 4 };
      marks.push(`<div class="box" style="${box(r)};border:2px solid ${a.color};border-radius:6px"></div>
        <div class="pin" style="left:${Math.max(x, 14) - 2}px;top:${Math.max(y, 14) - 2}px;background:${a.color}">${n}</div>`);
      legend.push(`<li><span class="num" style="background:${a.color}">${n}</span><span><b>${esc(p.name)}</b>${p.note ? `<br><i>${esc(p.note)}</i>` : ''}</span></li>`);
    }
    legend.push('</ol></div>');
  }
  return doc(`<div style="display:flex;gap:24px;margin:${MARGIN}px">
    <div class="frame" style="width:${W}px;height:${H}px">${shot(c)}${marks.join('')}</div>
    <div class="legend" style="width:${LEGEND}px">${legend.join('')}</div>
  </div>`);
}

function doc(body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; background: #f1f3f5; color: #212529; font: 14px/1.3 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    body { display: inline-block; }
    .frame { position: relative; overflow: hidden; border-radius: 4px; box-shadow: 0 2px 12px #0003; }
    .frame img { display: block; }
    .box { position: absolute; box-sizing: border-box; border-radius: 8px; }
    .tag { position: absolute; padding: 5px 12px; border-radius: 999px; color: #fff; font-size: 17px; font-weight: 700; white-space: nowrap; box-shadow: 0 1px 4px #0005; }
    .pin { position: absolute; transform: translate(-45%, -45%); width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; color: #fff; font-size: 13px; font-weight: 700; box-shadow: 0 0 0 2px #fff, 0 1px 4px #0006; }
    .legend { columns: 2; column-gap: 20px; }
    .group { break-inside: avoid; padding-bottom: 6px; }
    .legend h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; font-size: 16px; }
    .swatch { width: 12px; height: 12px; border-radius: 3px; }
    .legend ol { list-style: none; margin: 0 0 6px; padding: 0; }
    .legend li { display: flex; align-items: flex-start; gap: 10px; margin: 5px 0; }
    .legend i { color: #495057; font-size: 13px; font-style: normal; }
    .num { flex: none; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; color: #fff; font-size: 12px; font-weight: 700; }
  </style></head><body>${body}</body></html>`;
}

/** Renders an overlay page at the page's own size (2x) and writes it as PNG. */
async function render(page: Page, html: string, file: string): Promise<void> {
  await page.setContent(html);
  await page.evaluate(() => document.fonts.ready);
  const size = await page.evaluate(() => ({ width: document.body.offsetWidth, height: document.body.offsetHeight }));
  await page.setViewportSize(size);
  await page.screenshot({ path: file });
}

test('ui map', async ({ app, page, browser }) => {
  const c = await capture(app, page);
  expect(app.errors).toEqual([]);
  mkdirSync(OUT_DIR, { recursive: true });
  const ctx = await browser.newContext({ deviceScaleFactor: 2 });
  try {
    const overlay = await ctx.newPage();
    await render(overlay, areasHtml(c), path.join(OUT_DIR, 'ui-map-areas.png'));
    await render(overlay, partsHtml(c), path.join(OUT_DIR, 'ui-map-parts.png'));
  } finally {
    await ctx.close();
  }
});
