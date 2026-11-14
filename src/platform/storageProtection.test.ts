import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Fresh module per test: it remembers whether it already asked in this session. */
async function load() {
  vi.resetModules();
  return import('./storageProtection');
}

function stubNavigator(nav: Partial<Navigator> & { standalone?: boolean }) {
  vi.stubGlobal('navigator', { userAgent: '', maxTouchPoints: 0, ...nav });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('requestPersistentStorageOnce', () => {
  let persist: ReturnType<typeof vi.fn>;
  let persisted: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    persist = vi.fn(async () => true);
    persisted = vi.fn(async () => false);
    stubNavigator({ storage: { persist, persisted } as unknown as StorageManager });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks once per session', async () => {
    const { requestPersistentStorageOnce } = await load();
    requestPersistentStorageOnce();
    requestPersistentStorageOnce();
    await flush();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does not ask again once the browser keeps the data', async () => {
    persisted.mockResolvedValue(true);
    const { requestPersistentStorageOnce } = await load();
    requestPersistentStorageOnce();
    await flush();
    expect(persist).not.toHaveBeenCalled();
  });

  it('does nothing without the Storage API', async () => {
    stubNavigator({});
    const { requestPersistentStorageOnce, isStoragePersisted } = await load();
    expect(() => requestPersistentStorageOnce()).not.toThrow();
    expect(await isStoragePersisted()).toBe(false);
  });
});

describe('isAppleMobileBrowserTab', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is true in iPad Safari (Mac user agent with touch) and iPhone Safari', async () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', maxTouchPoints: 5, standalone: false });
    expect((await load()).isAppleMobileBrowserTab()).toBe(true);
    stubNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5, standalone: false });
    expect((await load()).isAppleMobileBrowserTab()).toBe(true);
  });

  it('is false on a Mac, in a Home Screen app and on other devices', async () => {
    stubNavigator({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', maxTouchPoints: 0 });
    expect((await load()).isAppleMobileBrowserTab()).toBe(false);
    stubNavigator({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', maxTouchPoints: 5, standalone: true });
    expect((await load()).isAppleMobileBrowserTab()).toBe(false);
    stubNavigator({ userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/140', maxTouchPoints: 5 });
    expect((await load()).isAppleMobileBrowserTab()).toBe(false);
  });
});
