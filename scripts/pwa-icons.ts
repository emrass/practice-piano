/**
 * Renders the web app icons in pwa/icons/ from the native app icon, so the installed web app
 * and the iPad/Mac app look the same. Run after changing AppIcon.png:
 *
 *   node scripts/pwa-icons.ts      (Node 22.18+ runs TypeScript directly)
 *
 * - icon-192/512.png   purpose "any": rounded corners, like the favicon
 * - maskable-512.png   purpose "maskable": full bleed, artwork inside the 80% safe circle
 * - apple-touch-icon.png  180 px, full bleed (iOS rounds the corners itself)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const SOURCE = 'native/PracticePiano/Assets.xcassets/AppIcon.appiconset/AppIcon.png';
const OUT = 'pwa/icons';

const variants = [
  { file: 'icon-192.png', size: 192, radius: 0.22, scale: 1 },
  { file: 'icon-512.png', size: 512, radius: 0.22, scale: 1 },
  { file: 'maskable-512.png', size: 512, radius: 0, scale: 0.84 },
  { file: 'apple-touch-icon.png', size: 180, radius: 0, scale: 1 },
];

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const src = `data:image/png;base64,${readFileSync(SOURCE).toString('base64')}`;
mkdirSync(OUT, { recursive: true });

for (const v of variants) {
  const dataUrl = await page.evaluate(async ({ src, size, radius, scale }) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    if (radius) {
      ctx.beginPath();
      ctx.roundRect(0, 0, size, size, size * radius);
      ctx.clip();
    }
    // Background: the icon's own corner color, so scaled-down artwork sits on the same field.
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    probe.getContext('2d')!.drawImage(img, 0, 0, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = probe.getContext('2d')!.getImageData(0, 0, 1, 1).data;
    ctx.fillStyle = `rgb(${r} ${g} ${b})`;
    ctx.fillRect(0, 0, size, size);
    const d = size * scale;
    ctx.drawImage(img, (size - d) / 2, (size - d) / 2, d, d);
    return canvas.toDataURL('image/png');
  }, { src, ...v });
  writeFileSync(`${OUT}/${v.file}`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`${OUT}/${v.file}`);
}

await browser.close();
