import { expect, test } from './support';

test('An on-screen key held with the mouse stays held through octave shifts and a new exercise', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight', keyboardView: 'full' } });
  const key = page.locator('.keys .key[data-midi="62"]');
  const box = (await key.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 10);
  await page.mouse.down();
  await expect(key).toHaveClass(/is-held/);
  await page.keyboard.press('KeyX'); // computer-keyboard octave up
  await page.keyboard.press('KeyZ');
  await expect(key).toHaveClass(/is-held/);
  const first = await app.exercise((ex) => ex.id);
  await page.keyboard.press('KeyN');
  await expect.poll(() => app.exercise((ex) => ex.id)).not.toBe(first);
  await expect(key).toHaveClass(/is-held/);
  await page.mouse.up();
  await expect(key).not.toHaveClass(/is-held/);
});
