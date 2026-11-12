import type { StorageAdapter } from './storage';

export interface UserIdentity {
  /** Stable id that scopes all stored data. */
  id: string;
  /** 'local' in v1; future providers: 'google', 'apple', 'email'… */
  provider: string;
  displayName: string;
  email?: string;
  isAnonymous: boolean;
}

/**
 * Identity port. v1 uses an anonymous, device-local identity. A v2 auth provider
 * (e.g. Google sign-in via Firebase Auth / Supabase Auth) implements this interface; the
 * ProfileRepository already scopes every key by `identity.id`, so data can be migrated
 * from the local id to the account id on first sign-in.
 */
export interface IdentityProvider {
  current(): Promise<UserIdentity>;
  /** v2: sign-in / sign-out. Local provider reports false. */
  readonly supportsSignIn: boolean;
}

const LOCAL_ID_KEY = 'identity/local-id';

function randomId(): string {
  const c = globalThis.crypto;
  if (c && 'randomUUID' in c) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class LocalIdentityProvider implements IdentityProvider {
  readonly supportsSignIn = false;
  private cached: UserIdentity | null = null;

  constructor(private readonly storage: StorageAdapter) {}

  async current(): Promise<UserIdentity> {
    if (this.cached) return this.cached;
    let id = await this.storage.getItem(LOCAL_ID_KEY);
    if (!id) {
      id = `local-${randomId()}`;
      await this.storage.setItem(LOCAL_ID_KEY, id);
    }
    this.cached = { id, provider: 'local', displayName: 'You', isAnonymous: true };
    return this.cached;
  }
}
