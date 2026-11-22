// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applySettingsPatch, DEFAULT_SETTINGS } from '../../core/settings';
import { LocalIdentityProvider } from '../../persistence/identity';
import { ProfileRepository } from '../../persistence/profileRepository';
import { MemoryStorageAdapter } from '../../persistence/storage';

const holder = vi.hoisted(() => ({ repo: null as unknown as ProfileRepository }));
vi.mock('../state/useProfile', () => ({
  get profileRepository() {
    return holder.repo;
  },
}));

const { DataDialog } = await import('./DataDialog');

function setup() {
  const onDataReplaced = vi.fn();
  const onErased = vi.fn();
  const onClose = vi.fn();
  render(<DataDialog storageKind="memory" onDataReplaced={onDataReplaced} onErased={onErased} onClose={onClose} />);
  return { onDataReplaced, onErased, onClose };
}

async function pick(text: string) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File([text], 'backup.json', { type: 'application/json' });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

const title = () => screen.getByRole('dialog').querySelector('.dialog-title')?.textContent;

beforeEach(async () => {
  const storage = new MemoryStorageAdapter();
  holder.repo = new ProfileRepository(storage, new LocalIdentityProvider(storage));
  await holder.repo.saveSettings(applySettingsPatch(DEFAULT_SETTINGS, { setupGuideSeen: true, theme: 'dark' }));
});
afterEach(cleanup);

describe('Your data', () => {
  it('says it covers every lesson and all settings', () => {
    setup();
    expect(title()).toBe('Your data');
    expect(screen.getByText('Your progress in every lesson and all your settings.')).toBeTruthy();
  });

  it('copies a backup', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    });
    expect(JSON.parse(writeText.mock.calls[0][0])).toMatchObject({ format: 'practice-piano.backup', settings: { theme: 'dark' } });
    expect(screen.getByText('Backup copied to the clipboard.')).toBeTruthy();
  });

  it('shows why a file cannot be read, without asking', async () => {
    setup();
    await pick('not json');
    expect(title()).toBe('Your data');
    expect(screen.getByText('This file is not valid JSON.')).toBeTruthy();
  });

  it('asks before restoring, and Cancel keeps the data', async () => {
    const backup = await holder.repo.exportBackup(new Date('2026-03-04T10:00:00.000Z'));
    await holder.repo.saveSettings(applySettingsPatch(DEFAULT_SETTINGS, { setupGuideSeen: true, theme: 'light' }));
    const { onDataReplaced } = setup();
    await pick(backup);
    expect(title()).toBe('Replace everything with this backup?');
    expect(screen.getByRole('dialog').textContent).toContain('replaced by the backup from');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(title()).toBe('Your data');
    expect((await holder.repo.load()).settings.theme).toBe('light');
    expect(onDataReplaced).not.toHaveBeenCalled();

    await pick(backup);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replace everything' }));
    });
    expect((await holder.repo.load()).settings.theme).toBe('dark');
    expect(onDataReplaced).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }), expect.anything());
    expect(screen.getByText('Backup restored.')).toBeTruthy();
  });

  it('asks before erasing, then erases everything', async () => {
    const { onDataReplaced, onErased } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Erase everything' }));
    expect(title()).toBe('Erase all progress and settings?');
    expect(screen.getByRole('button', { name: 'Export a backup first' })).toBeTruthy();
    expect((await holder.repo.load()).settings.theme).toBe('dark');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Erase everything' }));
    });
    expect((await holder.repo.load()).settings).toEqual(DEFAULT_SETTINGS);
    expect(onDataReplaced).toHaveBeenCalledWith(DEFAULT_SETTINGS, expect.anything());
    expect(onErased).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
