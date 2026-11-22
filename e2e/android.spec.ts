import type { Page } from '@playwright/test';
import { expect, test } from './support';

/**
 * The Android app (android/): the page as the app hosts it, with a fake of the message listener
 * the app injects (`window.practicePianoAndroid`) answering like MainActivity and MidiBridge.
 * The Kotlin side has its own unit tests; this checks the protocol from the page's side.
 */

type Command = { cmd: string } & Record<string, unknown>;

declare global {
  interface Window {
    __androidSent: Command[];
    __practicePianoNative?: { receive(msg: unknown): void; back(): boolean };
  }
}

function fakeAndroid() {
  window.__androidSent = [];
  window.practicePianoAndroid = {
    postMessage(text: string) {
      const cmd = JSON.parse(text) as Command;
      window.__androidSent.push(cmd);
      if (cmd.cmd === 'hello' || cmd.cmd === 'rescan') {
        setTimeout(() =>
          window.__practicePianoNative!.receive({
            type: 'inputs',
            inputs: [{ id: 'bt:AA:BB:CC:DD:EE:FF:0', name: 'Bluetooth Piano', manufacturer: 'Test', online: true }],
          }),
        );
      }
    },
  };
}

declare global {
  interface Window {
    practicePianoAndroid?: { postMessage(text: string): void };
  }
}

function sent(page: Page): Promise<Command[]> {
  return page.evaluate(() => window.__androidSent);
}

function receive(page: Page, msg: unknown): Promise<void> {
  return page.evaluate((m) => window.__practicePianoNative!.receive(m), msg);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(fakeAndroid);
});

test('The piano comes from Android MIDI, and Pair Bluetooth MIDI asks the app', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight' } });
  await expect(page.locator('.chip-midi')).toContainText('Bluetooth Piano');
  expect(await sent(page)).toContainEqual({ cmd: 'hello' });

  const dialog = await app.openPianoAudio();
  await expect(dialog).toContainText('MIDI: Android MIDI (native app)');
  await receive(page, { type: 'midi', source: 'bt:AA:BB:CC:DD:EE:FF:0', data: [0x90, 60, 80] });
  await expect(dialog).toContainText('We hear you: C4');
  await receive(page, { type: 'midi', source: 'bt:AA:BB:CC:DD:EE:FF:0', data: [0x80, 60, 0] });

  await dialog.getByRole('button', { name: 'Pair Bluetooth MIDI' }).click();
  expect(await sent(page)).toContainEqual({ cmd: 'showBluetoothPairing' });
  // The sheet closed: the page rescans.
  await receive(page, { type: 'bluetoothClosed' });
  await expect.poll(async () => (await sent(page)).filter((c) => c.cmd === 'rescan').length).toBeGreaterThan(0);
});

test('The back gesture closes what is open, then lets the app go', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight' } });
  const dialog = await app.openPianoAudio();
  expect(await page.evaluate(() => window.__practicePianoNative!.back())).toBe(true);
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.__practicePianoNative!.back())).toBe(false);
});

test('The system bars follow the theme', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight', theme: 'dark' } });
  await expect.poll(async () => (await sent(page)).filter((c) => c.cmd === 'theme').at(-1)).toEqual({ cmd: 'theme', dark: true, color: '#221e1a' });
});

test('Export file saves through the system picker', async ({ app, page }) => {
  await app.open({ settings: { lesson: 'sight' } });
  await page.getByRole('button', { name: 'Your data' }).click();
  await page.getByRole('button', { name: 'Export file' }).click();
  await expect.poll(async () => (await sent(page)).find((c) => c.cmd === 'saveFile')).toBeTruthy();
  const save = (await sent(page)).find((c) => c.cmd === 'saveFile')!;
  expect(save).toMatchObject({ mimeType: 'application/json', name: expect.stringMatching(/^practice-piano-backup-.*\.json$/) });
  expect(JSON.parse(save.text as string)).toHaveProperty('settings');
  await receive(page, { type: 'fileSaved', id: save.id, status: 'saved' });
  await expect(page.getByText('Backup saved.')).toBeVisible();
});
