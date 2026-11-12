import http from 'node:http';
import { exec } from 'node:child_process';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { OAUTH_SCOPES, type Config } from '../config/config.js';
import type { StoredToken } from './TokenStore.js';
import { DomainError } from '../errors.js';

function openBrowser(url: string) {
  const platform = process.platform;
  let cmd = '';
  if (platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd, () => {
    // If opening the browser fails, the user will still see the link printed to console.
  });
}

export async function runLoopbackOAuthFlow(config: Config): Promise<StoredToken> {
  if (!config.googleClientId || !config.googleClientSecret) {
    throw new DomainError(
      'AUTH_REQUIRED',
      'Missing Google OAuth Client ID or Client Secret in configuration.',
      false,
      'Ensure GDM_GOOGLE_CLIENT_ID and GDM_GOOGLE_CLIENT_SECRET or a valid client_secret*.json are available.'
    );
  }

  return new Promise((resolve, reject) => {
    const server = http.createServer();

    server.listen(0, '127.0.0.1', async () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        return reject(new Error('Failed to bind local loopback server.'));
      }

      const port = address.port;
      const redirectUri = `http://127.0.0.1:${port}`;

      const oauth2Client = new OAuth2Client({
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        redirectUri,
      });

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [...OAUTH_SCOPES],
      });

      console.error('\n=== Google OAuth 2.0 Authorization ===');
      console.error('Opening browser for authorization. If it does not open automatically, visit this URL:');
      console.error(`\n${authUrl}\n`);

      openBrowser(authUrl);

      server.on('request', async (req, res) => {
        try {
          const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${port}`);
          const code = reqUrl.searchParams.get('code');
          const error = reqUrl.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h1>Authentication Failed</h1><p>${error}</p>`);
            server.close();
            return reject(new DomainError('AUTH_REQUIRED', `Google OAuth error: ${error}`));
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>Missing code</h1>');
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(
            '<html><body style="font-family:sans-serif;text-align:center;padding:50px;">' +
              '<h2>Authentication Successful!</h2>' +
              '<p>You may now close this browser tab and return to Antigravity.</p>' +
              '</body></html>'
          );

          server.close();

          const { tokens } = await oauth2Client.getToken(code);
          oauth2Client.setCredentials(tokens);

          if (!tokens.refresh_token) {
            return reject(
              new DomainError(
                'AUTH_REQUIRED',
                'No refresh token returned by Google. If previously authorized, revoke access at https://myaccount.google.com/permissions and retry with prompt=consent.'
              )
            );
          }

          let accountEmail = '';
          try {
            const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
            const userInfo = await oauth2.userinfo.get();
            accountEmail = userInfo.data.email || '';
          } catch {
            // If userinfo fails, try extracting from id_token payload
            if (tokens.id_token) {
              try {
                const parts = tokens.id_token.split('.');
                if (parts[1]) {
                  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
                  accountEmail = payload.email || '';
                }
              } catch {
                // Ignore payload parse fallback
              }
            }
          }

          const storedToken: StoredToken = {
            refresh_token: tokens.refresh_token,
            access_token: tokens.access_token || undefined,
            expiry_date: tokens.expiry_date || undefined,
            account_email: accountEmail.toLowerCase(),
            scopes: tokens.scope ? tokens.scope.split(' ') : [...OAUTH_SCOPES],
            created_at: new Date().toISOString(),
          };

          resolve(storedToken);
        } catch (err: any) {
          server.close();
          reject(new DomainError('AUTH_REQUIRED', err?.message || 'Failed to exchange authorization code.'));
        }
      });
    });

    server.on('error', (err) => {
      reject(new DomainError('AUTH_REQUIRED', `Loopback server error: ${err.message}`));
    });
  });
}
