import { describe, it, expect } from 'vitest';
import { EnvTokenStore } from '../../src/auth/EnvTokenStore.js';
import type { Config } from '../../src/config/config.js';

describe('EnvTokenStore', () => {
  it('loads token from config.googleRefreshToken and accountEmail', async () => {
    const config = {
      googleRefreshToken: 'test-env-refresh-token-12345',
      accountEmail: 'User@Example.Com',
    } as unknown as Config;

    const store = new EnvTokenStore(config);
    const token = await store.load();

    expect(token).toBeDefined();
    expect(token?.refresh_token).toBe('test-env-refresh-token-12345');
    expect(token?.account_email).toBe('user@example.com');
    expect(token?.scopes.length).toBeGreaterThan(0);
  });

  it('delegates to fallback store when googleRefreshToken is unset', async () => {
    const config = {} as Config;
    const fallbackStore = {
      load: async () => ({
        refresh_token: 'fallback-token',
        account_email: 'fallback@example.com',
        scopes: [],
        created_at: '',
      }),
      save: async () => {},
      clear: async () => {},
    };

    const store = new EnvTokenStore(config, fallbackStore);
    const token = await store.load();

    expect(token?.refresh_token).toBe('fallback-token');
  });

  it('returns null if neither env nor fallback have token', async () => {
    const config = {} as Config;
    const store = new EnvTokenStore(config);
    const token = await store.load();
    expect(token).toBeNull();
  });
});
