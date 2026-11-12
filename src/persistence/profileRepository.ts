import { normalizeProgress, type ProgressState } from '../core/progress/progress';
import { normalizeSettings, type Settings } from '../core/settings';
import type { IdentityProvider, UserIdentity } from './identity';
import type { StorageAdapter } from './storage';

export const BACKUP_FORMAT = 'practice-piano.backup';
export const BACKUP_VERSION = 1;

export interface ProfileData {
  settings: Settings;
  progress: ProgressState;
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  app: string;
  user: { id: string; provider: string };
  settings: Settings;
  progress: ProgressState;
}

export class BackupError extends Error {}

/** Validate + migrate a parsed backup file. Throws BackupError on anything unusable. */
export function parseBackup(json: string): ProfileData {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new BackupError('This file is not valid JSON.');
  }
  if (!raw || typeof raw !== 'object') throw new BackupError('Backup file is empty.');
  const r = raw as Partial<BackupFile>;
  if (r.format !== BACKUP_FORMAT) throw new BackupError('This is not a practice-piano.com backup file.');
  if (typeof r.version !== 'number' || r.version > BACKUP_VERSION) {
    throw new BackupError('This backup was made by a newer version of the app.');
  }
  // Future: if (r.version < BACKUP_VERSION) migrate step by step here.
  return { settings: normalizeSettings(r.settings), progress: normalizeProgress(r.progress) };
}

/**
 * Persists one user's settings and progress. All keys are scoped by user id so a cloud
 * sync / account system can be layered on later without changing callers.
 */
export class ProfileRepository {
  private user: UserIdentity | null = null;

  constructor(
    private readonly storage: StorageAdapter,
    private readonly identity: IdentityProvider,
  ) {}

  get storageKind(): string {
    return this.storage.kind;
  }

  async currentUser(): Promise<UserIdentity> {
    this.user ??= await this.identity.current();
    return this.user;
  }

  private async key(name: 'settings' | 'progress'): Promise<string> {
    const user = await this.currentUser();
    return `users/${user.id}/${name}`;
  }

  private async readJson(name: 'settings' | 'progress'): Promise<unknown> {
    const raw = await this.storage.getItem(await this.key(name));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null; // corrupted entry → fall back to defaults
    }
  }

  async load(): Promise<ProfileData> {
    const [settings, progress] = await Promise.all([this.readJson('settings'), this.readJson('progress')]);
    return { settings: normalizeSettings(settings), progress: normalizeProgress(progress) };
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.storage.setItem(await this.key('settings'), JSON.stringify(settings));
  }

  async saveProgress(progress: ProgressState): Promise<void> {
    await this.storage.setItem(await this.key('progress'), JSON.stringify(progress));
  }

  async exportBackup(now = new Date()): Promise<string> {
    const user = await this.currentUser();
    const data = await this.load();
    const file: BackupFile = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: now.toISOString(),
      app: 'practice-piano.com',
      user: { id: user.id, provider: user.provider },
      settings: data.settings,
      progress: data.progress,
    };
    return JSON.stringify(file, null, 2);
  }

  /** Replaces the current profile with the backup's contents. */
  async importBackup(json: string): Promise<ProfileData> {
    const data = parseBackup(json);
    await this.saveSettings(data.settings);
    await this.saveProgress(data.progress);
    return data;
  }

  /** Deletes this user's settings and progress. */
  async reset(): Promise<ProfileData> {
    const user = await this.currentUser();
    for (const k of await this.storage.keys(`users/${user.id}/`)) await this.storage.removeItem(k);
    return this.load();
  }
}
