import { Redis } from '@upstash/redis';
import type { TokenStore, StoredToken } from './TokenStore.js';
import type { Config } from '../config/config.js';

const TOKEN_KEY = 'gdm:tokens:default';

export class RedisTokenStore implements TokenStore {
  private redis: Redis | null = null;

  constructor(
    private readonly config: Config,
    private readonly fallbackStore?: TokenStore
  ) {
    if (config.upstashRedisRestUrl && config.upstashRedisRestToken) {
      this.redis = new Redis({
        url: config.upstashRedisRestUrl,
        token: config.upstashRedisRestToken,
      });
    }
  }

  async load(): Promise<StoredToken | null> {
    if (this.redis) {
      try {
        const data = await this.redis.get<StoredToken>(TOKEN_KEY);
        if (data && data.refresh_token) {
          return data;
        }
      } catch {
        // Fall through to fallback on Redis failure
      }
    }

    if (this.fallbackStore) {
      return this.fallbackStore.load();
    }

    return null;
  }

  async save(token: StoredToken): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.set(TOKEN_KEY, token);
      } catch {
        // Log or handle best effort
      }
    }

    if (this.fallbackStore) {
      await this.fallbackStore.save(token);
    }
  }

  async clear(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.del(TOKEN_KEY);
      } catch {
        // Ignore deletion errors
      }
    }

    if (this.fallbackStore) {
      await this.fallbackStore.clear();
    }
  }
}
