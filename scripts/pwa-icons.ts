/**
 * Renders the app icons, web and native, from the keys (design/system/assets/Logos/practice-piano-keys.svg):
 * two black keys on paper in an oxblood outline. Run after changing the keys:
 *
 *   node scripts/pwa-icons.ts      (Node 22.18+ runs TypeScript directly)
 *
 * The paper runs to the edge of every icon and the platform cuts the corners, so the outlined keys
 * sit inside it as a frame, with the logo's own proportions (corner radius, outline, keys).
 *
 * - AppIcon.png (native, 1024 px) and apple-touch-icon.png (180 px): full bleed and opaque; iPadOS,
 *   iOS and macOS round the corners themselves.
 * - icon-192/512.png   purpose "any": the same picture with the corners rounded here, as iOS does.
 * - maskable-512.png   purpose "maskable": full bleed, the frame inside the safe zone (a circle of
 *   80% of the width), which the script checks.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as zlibModule from 'node:zlib';
import { chromium } from '@playwright/test';

const KEYS = 'design/system/assets/Logos/practice-piano-keys.svg';
const NATIVE = 'native/PracticePiano/Assets.xcassets/AppIcon.appiconset/AppIcon.png';
const OUT = 'pwa/icons';

/** The keys' four parts, as drawn in the file (light theme colors). */
const keys = readFileSync(KEYS, 'utf8');
const inner = keys.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const field = /class="logo-keys-field"[^>]*fill="(#[0-9a-f]{6})"/i.exec(keys)?.[1];
const frame = /<rect class="logo-keys-edge" x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="[\d.]+" rx="([\d.]+)"[^>]*stroke-width="([\d.]+)"/.exec(keys);
if (!field || !frame) throw new Error(`${KEYS}: no logo-keys-field fill or logo-keys-edge rect`);
const [frameX, frameW, frameRx, edgeW] = frame.slice(1).map(Number);

/**
 * One icon as SVG, on a 100-unit square: the paper to the edge, the keys centered in it with their
 * frame `size` units wide, and the corners rounded by `radius` (a share of the width; 0 for none).
 */
function icon(size: number, radius: number): string {
  const unit = size / frameW; // icon units per keys unit
  const box = 28 * unit; // the keys' 28-unit view box
  const at = 50 - (frameX + frameW / 2) * unit;
  const clip = radius ? `<clipPath id="c"><rect width="100" height="100" rx="${radius * 100}"/></clipPath>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${clip}<g${radius ? ' clip-path="url(#c)"' : ''}><rect width="100" height="100" fill="${field}"/><svg x="${at}" y="${at}" width="${box}" height="${box}" viewBox="0 0 28 28" overflow="visible">${inner}</svg></g></svg>`;
}

/** How far the frame's outer edge reaches from the center, as a share of the icon's width. */
function reach(size: number): number {
  const unit = size / frameW;
  const half = (frameW / 2 + edgeW / 2) * unit;
  const corner = (frameRx + edgeW / 2) * unit;
  return ((half - corner) * Math.SQRT2 + corner) / 100;
}

/** The frame on the full-bleed icons: 82% of the width, a paper margin of 9% on each side. */
const FRAME = 82;
/** The frame on the maskable icon: as large as the safe zone allows. */
const MASKABLE_FRAME = 62;
if (reach(MASKABLE_FRAME) > 0.4) throw new Error(`maskable icon: the frame reaches ${reach(MASKABLE_FRAME)} of the width, outside the 0.4 safe zone`);

const variants = [
  { file: NATIVE, size: 1024, svg: icon(FRAME, 0), opaque: true },
  { file: `${OUT}/apple-touch-icon.png`, size: 180, svg: icon(FRAME, 0), opaque: true },
  { file: `${OUT}/icon-192.png`, size: 192, svg: icon(FRAME, 0.2237), opaque: false },
  { file: `${OUT}/icon-512.png`, size: 512, svg: icon(FRAME, 0.2237), opaque: false },
  { file: `${OUT}/maskable-512.png`, size: 512, svg: icon(MASKABLE_FRAME, 0), opaque: true },
];

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const page = await browser.newPage();
mkdirSync(OUT, { recursive: true });

for (const v of variants) {
  const src = `data:image/svg+xml;base64,${Buffer.from(v.svg).toString('base64')}`;
  // A canvas, not a screenshot: it keeps the transparent corners, and an opaque icon drops the alpha
  // channel below (the App Store refuses an app icon with one).
  const dataUrl = await page.evaluate(
    async ({ src, size, opaque }) => {
      const img = new Image(size, size);
      img.src = src;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d', { alpha: !opaque })!;
      ctx.drawImage(img, 0, 0, size, size);
      return canvas.toDataURL('image/png');
    },
    { src, size: v.size, opaque: v.opaque },
  );
  const png = Buffer.from(dataUrl.split(',')[1], 'base64');
  writeFileSync(v.file, v.opaque ? dropAlpha(png) : png);
  console.log(v.file);
}

await browser.close();

/**
 * Rewrites an opaque RGBA PNG as RGB. Canvas always encodes RGBA; this decodes the image data,
 * drops every fourth byte and encodes it again (no filtering), with Node's zlib.
 */
function dropAlpha(png: Buffer): Buffer {
  const { inflateSync, deflateSync, crc32 } = zlibModule;
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (png[24] !== 8 || png[25] !== 6) return png;
  const chunks: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const len = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    if (type === 'IDAT') chunks.push(png.subarray(at + 8, at + 8 + len));
    at += 12 + len;
  }
  const raw = unfilter(inflateSync(Buffer.concat(chunks)), width, height, 4);
  const rgb = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    rgb[y * (1 + width * 3)] = 0;
    for (let x = 0; x < width; x++) raw.copy(rgb, y * (1 + width * 3) + 1 + x * 3, (y * width + x) * 4, (y * width + x) * 4 + 3);
  }
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  return Buffer.concat([png.subarray(0, 8), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(rgb, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/** Reverses PNG row filters: returns the pixels without the filter byte per row. */
function unfilter(data: Buffer, width: number, height: number, bpp: number): Buffer {
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const v = data[y * (stride + 1) + 1 + x];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      out[y * stride + x] = (v + [0, a, b, (a + b) >> 1, paeth][filter]) & 0xff;
    }
  }
  return out;
}
