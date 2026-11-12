import type { TokenStore, StoredToken } from './TokenStore.js';
import { OAUTH_SCOPES, type Config } from '../config/config.js';

export class EnvTokenStore implements TokenStore {
  constructor(
    private readonly config: Config,
    private readonly fallbackStore?: TokenStore
  ) {}

  async load(): Promise<StoredToken | null> {
    if (this.config.googleRefreshToken) {
      return {
        refresh_token: this.config.googleRefreshToken,
        account_email: (this.config.accountEmail || '').toLowerCase(),
        scopes: [...OAUTH_SCOPES],
        created_at: new Date().toISOString(),
      };
    }

    if (this.fallbackStore) {
      return this.fallbackStore.load();
    }

    return null;
  }

  async save(token: StoredToken): Promise<void> {
    if (this.fallbackStore) {
      await this.fallbackStore.save(token);
    }
  }

  async clear(): Promise<void> {
    if (this.fallbackStore) {
      await this.fallbackStore.clear();
    }
  }
}
