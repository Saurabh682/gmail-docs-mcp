import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { EmailService } from './services/EmailService.js';
import type { DocService } from './services/DocService.js';
import { SendEmailInputShape, createSendEmailHandler } from './tools/sendEmail.js';
import { AppendToDocInputShape, createAppendToDocHandler } from './tools/appendToDoc.js';

export interface ServerDependencies {
  emailService: EmailService;
  docService: DocService;
}

export function createServer(deps: ServerDependencies): McpServer {
  const server = new McpServer({
    name: 'gmail-docs-mcp',
    version: '1.0.0',
  });

  // 1. send_email tool registration
  server.registerTool(
    'send_email',
    {
      title: 'Send email (Gmail)',
      description:
        'Sends a REAL email from the authenticated Gmail account. Recipients must be on the operator allowlist. ' +
        'Not idempotent: calling twice sends twice. Use dry_run: true to validate without sending.',
      inputSchema: SendEmailInputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    createSendEmailHandler(deps.emailService)
  );

  // 2. append_to_doc tool registration
  server.registerTool(
    'append_to_doc',
    {
      title: 'Append to Google Doc',
      description:
        'Appends text to the END of an existing Google Doc. Never edits or deletes existing content. ' +
        'Not idempotent: calling twice appends twice. Use dry_run: true to validate access first.',
      inputSchema: AppendToDocInputShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    createAppendToDocHandler(deps.docService)
  );

  return server;
}
