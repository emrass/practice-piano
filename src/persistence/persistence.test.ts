import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, applySettingsPatch, normalizeSettings } from '../core/settings';
import { applyResult, emptyProgress } from '../core/progress/progress';
import { LocalIdentityProvider } from './identity';
import { BackupError, parseBackup, ProfileRepository } from './profileRepository';
import { LocalStorageAdapter, MemoryStorageAdapter } from './storage';

function repo(storage = new MemoryStorageAdapter()) {
  return { storage, repo: new ProfileRepository(storage, new LocalIdentityProvider(storage)) };
}

const sampleResult = {
  mode: 'wait' as const,
  exerciseId: 'abc',
  level: 3,
  tierId: 't01',
  totalNotes: 1,
  correctNotes: 1,
  wrongNotes: 0,
  missedNotes: 0,
  pitchAccuracy: 1,
  timingAccuracy: null,
  medianReactionMs: null,
  meanAbsTimingMs: null,
  cleanSteps: 1,
  totalSteps: 1,
  durationMs: 1000,
  notes: [{ midi: 60, hand: 'rh' as const, clef: 'treble' as const, correct: true }],
  completedAt: 0,
};

describe('ProfileRepository', () => {
  it('returns defaults for a fresh install and persists changes', async () => {
    const { repo: r } = repo();
    const fresh = await r.load();
    expect(fresh.settings).toEqual(DEFAULT_SETTINGS);
    expect(fresh.progress).toEqual(emptyProgress());
    await r.saveSettings(applySettingsPatch(fresh.settings, { sight: { level: 42, hands: 'both' } }));
    const again = await r.load();
    expect(again.settings.sight.level).toBe(42);
    expect(again.settings.sight.hands).toBe('both');
  });

  it('scopes data by a stable local user id', async () => {
    const { storage, repo: r } = repo();
    await r.saveSettings(DEFAULT_SETTINGS);
    const user = await r.currentUser();
    expect(user.provider).toBe('local');
    expect(await storage.keys(`users/${user.id}/`)).toEqual([`users/${user.id}/settings`]);
    const second = new ProfileRepository(storage, new LocalIdentityProvider(storage));
    expect((await second.currentUser()).id).toBe(user.id);
  });

  it('round-trips a JSON backup into a different install', async () => {
    const a = repo().repo;
    const progress = applyResult(emptyProgress(), sampleResult, new Date(2026, 0, 1)).progress;
    await a.saveSettings(applySettingsPatch(DEFAULT_SETTINGS, { sight: { level: 37 }, theme: 'dark' }));
    await a.saveProgress(progress);
    const json = await a.exportBackup(new Date('2026-01-02T00:00:00Z'));
    expect(JSON.parse(json)).toMatchObject({ format: 'practice-piano.backup', version: 1, exportedAt: '2026-01-02T00:00:00.000Z' });

    const b = repo().repo;
    await b.importBackup(json);
    const loaded = await b.load();
    expect(loaded.settings.sight.level).toBe(37);
    expect(loaded.settings.theme).toBe('dark');
    expect(loaded.progress.xp).toBe(progress.xp);
    expect(loaded.progress.history).toHaveLength(1);
  });

  it('rejects invalid backups with a helpful message', () => {
    expect(() => parseBackup('not json')).toThrow(BackupError);
    expect(() => parseBackup('{"format":"something-else"}')).toThrow(/not a practice-piano/);
    expect(() => parseBackup('{"format":"practice-piano.backup","version":99}')).toThrow(/newer version/);
  });

  it('reset clears only this user', async () => {
    const { storage, repo: r } = repo();
    await storage.setItem('users/someone-else/settings', '{}');
    await r.saveSettings(applySettingsPatch(DEFAULT_SETTINGS, { sight: { level: 80 } }));
    await r.saveProgress(applyResult(emptyProgress(), sampleResult, new Date()).progress);
    const after = await r.reset();
    expect(after.settings.sight.level).toBe(1);
    expect(after.progress.xp).toBe(0);
    expect(await storage.getItem('users/someone-else/settings')).toBe('{}');
  });

  it('survives corrupted stored JSON', async () => {
    const { storage, repo: r } = repo();
    const user = await r.currentUser();
    await storage.setItem(`users/${user.id}/settings`, '{oops');
    expect((await r.load()).settings).toEqual(DEFAULT_SETTINGS);
  });
});

describe('LocalStorageAdapter', () => {
  it('namespaces keys', async () => {
    const data = new Map<string, string>();
    const fake: Storage = {
      get length() {
        return data.size;
      },
      clear: () => data.clear(),
      getItem: (k) => data.get(k) ?? null,
      key: (i) => [...data.keys()][i] ?? null,
      removeItem: (k) => void data.delete(k),
      setItem: (k, v) => void data.set(k, v),
    };
    const a = new LocalStorageAdapter(fake, 'ns:');
    await a.setItem('x/y', '1');
    expect(data.get('ns:x/y')).toBe('1');
    expect(await a.keys('x/')).toEqual(['x/y']);
  });
});

describe('normalizeSettings', () => {
  it('clamps and validates every field', () => {
    const s = normalizeSettings({
      sight: { level: 500, hands: 'feet', bars: 7, rhythmComplexity: 9, maxPolyphony: 0, bpm: 999 },
      latencyMs: -5,
      keyboardSize: 100,
    });
    expect(s.sight.level).toBe(100);
    expect(s.sight.hands).toBe('rh');
    expect(s.sight.bars).toBe(4);
    expect(s.latencyMs).toBe(0);
    expect(s.sight.rhythmComplexity).toBe(4);
    expect(s.sight.maxPolyphony).toBe(1);
    expect(s.sight.bpm).toBe(240);
    expect(s.keyboardSize).toBe(88);
    expect(normalizeSettings({ sight: { rhythmComplexity: 0 } }).sight.rhythmComplexity).toBe(0);
    expect(normalizeSettings({ sight: { rhythmComplexity: 'auto' } }).sight.rhythmComplexity).toBe('auto');
  });

  it('keeps each lesson in its own group and does not carry over the old flat fields', () => {
    const s = normalizeSettings({ level: 42, scaleType: 'blues', chords: { goalBpm: 96 }, rhythm: { rhKey: 60, lhKey: 60 } });
    expect(s.sight.level).toBe(1);
    expect(s.scales.type).toBe('major');
    expect(s.chords.goalBpm).toBe(96);
    expect(s.rhythm.lhKey).not.toBe(s.rhythm.rhKey);
    expect(s).not.toHaveProperty('level');
  });

  it('patches lesson groups field by field', () => {
    const s = applySettingsPatch(DEFAULT_SETTINGS, { chords: { mode: 'flow' }, theme: 'dark' });
    expect(s.chords).toEqual({ ...DEFAULT_SETTINGS.chords, mode: 'flow' });
    expect(s.theme).toBe('dark');
    expect(DEFAULT_SETTINGS.chords.mode).toBe('wait');
  });
});

describe('settings migration', () => {
  it('turns the v1.0 delayPlayhead flag into a playhead delay', () => {
    expect(normalizeSettings({ latencyMs: 180, delayPlayhead: true }).playheadDelayMs).toBe(180);
    expect(normalizeSettings({ latencyMs: 180, delayPlayhead: false }).playheadDelayMs).toBe(0);
    expect(normalizeSettings({ latencyMs: 180, playheadDelayMs: 140 }).playheadDelayMs).toBe(140);
  });

  it('validates stored calibration records', () => {
    expect(normalizeSettings({ calibration: { at: 5, latencyMs: 999, spreadMs: 12, taps: 15, playheadDelayMs: null } }).calibration).toMatchObject({
      latencyMs: 300,
      playheadDelayMs: null,
    });
    expect(normalizeSettings({ calibration: { nope: true } }).calibration).toBeNull();
    expect(normalizeSettings({}).pianoShortcuts).toBe(true);
  });
});
