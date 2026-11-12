import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../src/config/config.js';
import { FileTokenStore } from '../src/auth/TokenStore.js';
import { runLoopbackOAuthFlow } from '../src/auth/loopbackFlow.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'auth';

  const config = loadConfig(projectRoot);
  const tokenStore = new FileTokenStore(config.tokenPath);

  if (command === 'status' || command === 'auth:status') {
    const existing = await tokenStore.load();
    if (!existing) {
      console.log('No active authorization found.');
      console.log(`Token file does not exist at: ${config.tokenPath}`);
      console.log('Run "npm run auth" to authenticate.');
      return;
    }
    console.log('=== Current Authorization Status ===');
    console.log(`Account Email : ${existing.account_email}`);
    console.log(`Authorized at : ${existing.created_at}`);
    console.log(`Scopes        :\n  - ${existing.scopes.join('\n  - ')}`);
    console.log(`Token Path    : ${config.tokenPath}`);
    return;
  }

  if (command === 'revoke' || command === 'auth:revoke') {
    await tokenStore.clear();
    console.log('Local token store cleared successfully.');
    console.log(`Removed token file at: ${config.tokenPath}`);
    return;
  }

  console.log('Starting Google OAuth 2.0 flow for gmail-docs-mcp...');
  if (!config.googleClientId || !config.googleClientSecret) {
    console.error('\nError: Google Client ID or Client Secret not found.');
    console.error('Please configure GDM_GOOGLE_CLIENT_ID and GDM_GOOGLE_CLIENT_SECRET in .env');
    console.error('or place your downloaded client_secret_*.json in the project root directory.\n');
    process.exit(1);
  }

  try {
    const token = await runLoopbackOAuthFlow(config);
    await tokenStore.save(token);

    console.log('\n======================================================');
    console.log('  Google Authorization Completed Successfully!');
    console.log('======================================================');
    console.log(`Account Email : ${token.account_email}`);
    console.log(`Token Path    : ${config.tokenPath}`);
    console.log(`Scopes        :\n  - ${token.scopes.join('\n  - ')}`);
    console.log('\nYou can now run the MCP server with:');
    console.log('  npm start (or register it directly in Antigravity)\n');
  } catch (err: any) {
    console.error('\nAuthorization failed:');
    console.error(err.message || err);
    if (err.hint) {
      console.error(`Hint: ${err.hint}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error in auth script:', err);
  process.exit(1);
});
