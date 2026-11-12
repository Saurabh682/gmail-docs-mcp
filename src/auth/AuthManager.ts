import { OAuth2Client } from 'google-auth-library';
import { DomainError } from '../errors.js';
import type { Config } from '../config/config.js';
import type { TokenStore, StoredToken } from './TokenStore.js';
import { logger } from '../logger.js';

export class AuthManager {
  private oauth2Client: OAuth2Client | null = null;
  private cachedToken: StoredToken | null = null;

  constructor(
    private readonly config: Config,
    private readonly tokenStore: TokenStore
  ) {}

  /**
   * Initializes and returns an authenticated OAuth2Client.
   * Throws DomainError('AUTH_REQUIRED') if not authenticated.
   */
  async getAuthenticatedClient(): Promise<OAuth2Client> {
    if (this.oauth2Client && this.cachedToken) {
      return this.oauth2Client;
    }

    const stored = await this.tokenStore.load();
    if (!stored || !stored.refresh_token) {
      throw new DomainError(
        'AUTH_REQUIRED',
        'No active Google authorization found. Please authenticate before calling tools.',
        false,
        'Run "npm run auth" in the gmail-docs-mcp directory to complete OAuth consent.'
      );
    }

    this.cachedToken = stored;

    const client = new OAuth2Client({
      clientId: this.config.googleClientId,
      clientSecret: this.config.googleClientSecret,
    });

    client.setCredentials({
      refresh_token: stored.refresh_token,
      access_token: stored.access_token,
      expiry_date: stored.expiry_date,
    });

    // Listen to token refresh events and persist new tokens
    client.on('tokens', async (tokens) => {
      try {
        if (!this.cachedToken) return;
        const updated: StoredToken = {
          ...this.cachedToken,
          access_token: tokens.access_token || this.cachedToken.access_token,
          refresh_token: tokens.refresh_token || this.cachedToken.refresh_token,
          expiry_date: tokens.expiry_date || this.cachedToken.expiry_date,
        };
        this.cachedToken = updated;
        await this.tokenStore.save(updated);
        logger.debug({ status: 'tokens_refreshed', tool: 'auth' });
      } catch (err) {
        logger.error({ status: 'tokens_save_failed', error_code: 'INTERNAL_ERROR' });
      }
    });

    this.oauth2Client = client;
    return client;
  }

  /**
   * Returns the authenticated user's email address if available.
   */
  async getAccountEmail(): Promise<string | null> {
    if (this.cachedToken?.account_email) {
      return this.cachedToken.account_email;
    }
    const stored = await this.tokenStore.load();
    if (stored) {
      this.cachedToken = stored;
      return stored.account_email;
    }
    return null;
  }

  /**
   * Clears the current session and stored token.
   */
  async clearAuth(): Promise<void> {
    this.oauth2Client = null;
    this.cachedToken = null;
    await this.tokenStore.clear();
  }
}
