import fs from 'node:fs';
import path from 'node:path';
import { EnvTokenStore } from './EnvTokenStore.js';
import { RedisTokenStore } from './RedisTokenStore.js';
import type { Config } from '../config/config.js';

export interface StoredToken {
  refresh_token: string;
  access_token?: string;
  expiry_date?: number;
  account_email: string;
  scopes: string[];
  created_at: string;
}

export interface TokenStore {
  load(): Promise<StoredToken | null>;
  save(token: StoredToken): Promise<void>;
  clear(): Promise<void>;
}

export class FileTokenStore implements TokenStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<StoredToken | null> {
    try {
      if (!fs.existsSync(this.filePath)) {
        return null;
      }
      const raw = await fs.promises.readFile(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      if (data && typeof data === 'object' && data.refresh_token) {
        return data as StoredToken;
      }
      return null;
    } catch {
      return null;
    }
  }

  async save(token: StoredToken): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    const tmpPath = `${this.filePath}.${Date.now()}.tmp`;
    const data = JSON.stringify(token, null, 2);

    await fs.promises.writeFile(tmpPath, data, {
      encoding: 'utf8',
      mode: process.platform === 'win32' ? undefined : 0o600,
    });

    await fs.promises.rename(tmpPath, this.filePath);
  }

  async clear(): Promise<void> {
    try {
      if (fs.existsSync(this.filePath)) {
        await fs.promises.unlink(this.filePath);
      }
    } catch {
      // Ignore deletion errors
    }
  }
}

/**
 * Factory for creating the appropriate TokenStore based on environment:
 * - Upstash Redis (if configured)
 * - Environment variables (GDM_GOOGLE_REFRESH_TOKEN)
 * - Local file store (token.json)
 */
export function createTokenStore(config: Config): TokenStore {
  let store: TokenStore = new FileTokenStore(config.tokenPath);

  if (config.googleRefreshToken) {
    store = new EnvTokenStore(config, store);
  }

  if (config.upstashRedisRestUrl && config.upstashRedisRestToken) {
    store = new RedisTokenStore(config, store);
  }

  return store;
}
