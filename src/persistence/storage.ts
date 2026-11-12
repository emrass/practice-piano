/**
 * Async key–value storage port. v1 ships a localStorage adapter; a cloud adapter
 * (Firestore, Supabase, …) can implement the same interface in v2 without touching
 * any lesson or scoring code.
 */
export interface StorageAdapter {
  readonly kind: string;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  /** Keys that start with `prefix`. */
  keys(prefix?: string): Promise<string[]>;
}

export class MemoryStorageAdapter implements StorageAdapter {
  readonly kind = 'memory';
  private readonly map = new Map<string, string>();

  async getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  async setItem(key: string, value: string) {
    this.map.set(key, value);
  }

  async removeItem(key: string) {
    this.map.delete(key);
  }

  async keys(prefix = '') {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly kind = 'localStorage';

  constructor(
    private readonly storage: Storage,
    private readonly namespace = 'practice-piano:',
  ) {}

  async getItem(key: string) {
    return this.storage.getItem(this.namespace + key);
  }

  async setItem(key: string, value: string) {
    this.storage.setItem(this.namespace + key, value);
  }

  async removeItem(key: string) {
    this.storage.removeItem(this.namespace + key);
  }

  async keys(prefix = '') {
    const out: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const k = this.storage.key(i);
      if (k && k.startsWith(this.namespace + prefix)) out.push(k.slice(this.namespace.length));
    }
    return out;
  }
}

/** localStorage when usable (it can throw in private modes / sandboxed frames), memory otherwise. */
export function createDefaultStorage(): StorageAdapter {
  try {
    const ls = globalThis.localStorage;
    const probe = '__pp_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return new LocalStorageAdapter(ls);
  } catch {
    return new MemoryStorageAdapter();
  }
}
