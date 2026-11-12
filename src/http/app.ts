import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { loadConfig, type Config } from '../config/config.js';
import { createTokenStore } from '../auth/TokenStore.js';
import { AuthManager } from '../auth/AuthManager.js';
import { createLedger } from '../state/Ledger.js';
import { AuditLog } from '../state/AuditLog.js';
import { PolicyEngine } from '../policy/index.js';
import { GoogleGmailAdapter } from '../adapters/google/GoogleGmailAdapter.js';
import { GoogleDocsAdapter } from '../adapters/google/GoogleDocsAdapter.js';
import { EmailService } from '../services/EmailService.js';
import { DocService } from '../services/DocService.js';
import { createServer } from '../server.js';
import type { GmailPort } from '../ports/GmailPort.js';
import type { DocsPort } from '../ports/DocsPort.js';

export interface AppContext {
  config: Config;
  transport: StreamableHTTPServerTransport;
  emailService: EmailService;
  docService: DocService;
  handleNodeRequest: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
}

export interface CreateAppOptions {
  config?: Config;
  gmailPort?: GmailPort;
  docsPort?: DocsPort;
}

export async function createHttpApp(options: CreateAppOptions = {}): Promise<AppContext> {
  const config = options.config || loadConfig();

  const tokenStore = createTokenStore(config);
  const authManager = new AuthManager(config, tokenStore);
  const ledger = await createLedger(config);
  const auditLog = new AuditLog(config.stateDir, config.isServerless);

  const policyEngine = new PolicyEngine(config, ledger);
  const gmailAdapter = options.gmailPort || new GoogleGmailAdapter(authManager);
  const docsAdapter = options.docsPort || new GoogleDocsAdapter(authManager);

  const emailService = new EmailService(policyEngine, gmailAdapter, authManager, auditLog);
  const docService = new DocService(policyEngine, docsAdapter, authManager, auditLog);

  const server = createServer({ emailService, docService });

  // Stateless Streamable HTTP transport ideal for Vercel / Serverless
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  const handleNodeRequest = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    // 1. Health check route
    if (url.pathname === '/api/health' || url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'ok',
          server: 'gmail-docs-mcp',
          version: '1.0.0',
          mode: config.isServerless ? 'serverless' : 'http',
        })
      );
      return;
    }

    // 2. Authentication check (Bearer Token or x-mcp-api-key)
    if (config.serverApiKey) {
      const authHeader = req.headers.authorization || '';
      const customKeyHeader = req.headers['x-mcp-api-key'] || '';

      const tokenMatch = authHeader.startsWith('Bearer ') && authHeader.slice(7).trim() === config.serverApiKey;
      const keyMatch = customKeyHeader === config.serverApiKey;

      if (!tokenMatch && !keyMatch) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Invalid or missing Authorization Bearer token.',
            },
          })
        );
        return;
      }
    }

    // 3. Normalize Accept header for MCP Streamable HTTP compatibility
    const currentAccept = req.headers.accept || '';
    if (!currentAccept.includes('text/event-stream')) {
      req.headers.accept = currentAccept ? `${currentAccept}, text/event-stream` : 'application/json, text/event-stream';
    }

    // 4. Delegate to MCP Streamable HTTP Transport
    await transport.handleRequest(req, res);
  };

  return {
    config,
    transport,
    emailService,
    docService,
    handleNodeRequest,
  };
}
