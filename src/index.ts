import type { IncomingMessage, ServerResponse } from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config/config.js';
import { logger } from './logger.js';
import { FileTokenStore } from './auth/TokenStore.js';
import { AuthManager } from './auth/AuthManager.js';
import { Ledger } from './state/Ledger.js';
import { AuditLog } from './state/AuditLog.js';
import { PolicyEngine } from './policy/index.js';
import { GoogleGmailAdapter } from './adapters/google/GoogleGmailAdapter.js';
import { GoogleDocsAdapter } from './adapters/google/GoogleDocsAdapter.js';
import { EmailService } from './services/EmailService.js';
import { DocService } from './services/DocService.js';
import { createServer } from './server.js';
import { createHttpApp, type AppContext } from './http/app.js';

let httpAppContext: Promise<AppContext> | null = null;

/**
 * Serverless HTTP Handler for Vercel / Cloud deployments.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!httpAppContext) {
    httpAppContext = createHttpApp();
  }
  const app = await httpAppContext;
  await app.handleNodeRequest(req, res);
}

export { handler };

/**
 * Local Stdio bootstrap for desktop / local agents (Antigravity).
 * Runs only when not executing in a cloud serverless environment.
 */
async function bootstrapStdio() {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return;
  }

  try {
    const config = loadConfig();
    logger.setLevel(config.logLevel);

    logger.debug({ status: 'starting', tool: 'system' });

    const tokenStore = new FileTokenStore(config.tokenPath);
    const authManager = new AuthManager(config, tokenStore);
    const ledger = new Ledger(config.stateDir);
    const auditLog = new AuditLog(config.stateDir, false);

    const policyEngine = new PolicyEngine(config, ledger);
    const gmailAdapter = new GoogleGmailAdapter(authManager);
    const docsAdapter = new GoogleDocsAdapter(authManager);

    const emailService = new EmailService(policyEngine, gmailAdapter, authManager, auditLog);
    const docService = new DocService(policyEngine, docsAdapter, authManager, auditLog);

    const server = createServer({
      emailService,
      docService,
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    logger.info({ status: 'ready', tool: 'server' });
  } catch (err: any) {
    logger.error({
      status: 'bootstrap_failed',
      error_code: 'INTERNAL_ERROR',
    });
    process.exit(1);
  }
}

bootstrapStdio();
