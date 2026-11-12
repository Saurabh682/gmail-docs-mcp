import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createServer } from '../../src/server.js';
import { EmailService } from '../../src/services/EmailService.js';
import { DocService } from '../../src/services/DocService.js';
import { PolicyEngine } from '../../src/policy/index.js';
import { FakeGmail } from '../../src/adapters/fake/FakeGmail.js';
import { FakeDocs } from '../../src/adapters/fake/FakeDocs.js';
import { Ledger } from '../../src/state/Ledger.js';
import { AuditLog } from '../../src/state/AuditLog.js';
import { FileTokenStore } from '../../src/auth/TokenStore.js';
import { AuthManager } from '../../src/auth/AuthManager.js';
import type { Config } from '../../src/config/config.js';

describe('MCP Server Contract Tests', () => {
  let tempDir: string;
  let tokenStore: FileTokenStore;
  let authManager: AuthManager;
  let ledger: Ledger;
  let auditLog: AuditLog;
  let fakeGmail: FakeGmail;
  let fakeDocs: FakeDocs;
  let config: Config;
  let client: Client;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `gdm-contract-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tempDir, { recursive: true });

    config = {
      googleClientId: 'test-client-id',
      googleClientSecret: 'test-client-secret',
      tokenPath: path.join(tempDir, 'token.json'),
      stateDir: tempDir,
      allowedRecipients: ['user@example.com', '@allowedcompany.com'],
      maxRecipients: 5,
      maxSendsPerMinute: 10,
      maxSendsPerDay: 50,
      defaultDryRun: true,
      allowLiveSend: true, // Enabled for testing live flows
      allowedDocIds: ['doc-12345', 'doc-conflict'],
      maxAppendPerMinute: 10,
      maxSubjectChars: 200,
      maxBodyChars: 50000,
      maxAppendChars: 100000,
      logLevel: 'debug',
    };

    tokenStore = new FileTokenStore(config.tokenPath);
    await tokenStore.save({
      refresh_token: 'fake-refresh-token',
      access_token: 'fake-access-token',
      account_email: 'user@example.com',
      scopes: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/documents'],
      created_at: new Date().toISOString(),
    });

    authManager = new AuthManager(config, tokenStore);
    ledger = new Ledger(tempDir);
    auditLog = new AuditLog(tempDir);
    fakeGmail = new FakeGmail();
    fakeDocs = new FakeDocs();

    fakeDocs.setDoc('doc-12345', {
      title: 'Target Test Doc',
      revisionId: 'rev-0',
      endIndex: 10,
    });

    fakeDocs.setDoc('doc-conflict', {
      title: 'Conflict Test Doc',
      revisionId: 'rev-0',
      endIndex: 10,
    });

    const policyEngine = new PolicyEngine(config, ledger);
    const emailService = new EmailService(policyEngine, fakeGmail, authManager, auditLog);
    const docService = new DocService(policyEngine, fakeDocs, authManager, auditLog);

    const mcpServer = createServer({ emailService, docService });

    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);

    client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    try {
      await client.close();
      await clientTransport.close();
      await serverTransport.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  it('exposes exactly two tools with valid descriptions and annotations', async () => {
    const toolsResult = await client.listTools();
    const toolNames = toolsResult.tools.map((t) => t.name).sort();

    expect(toolNames).toEqual(['append_to_doc', 'send_email']);

    const sendEmailTool = toolsResult.tools.find((t) => t.name === 'send_email');
    expect(sendEmailTool?.description).toContain('Sends a REAL email');
    expect(sendEmailTool?.annotations?.destructiveHint).toBe(true);
    expect(sendEmailTool?.annotations?.idempotentHint).toBe(false);

    const appendDocTool = toolsResult.tools.find((t) => t.name === 'append_to_doc');
    expect(appendDocTool?.description).toContain('Appends text to the END');
    expect(appendDocTool?.annotations?.destructiveHint).toBe(false);
  });

  it('executes send_email with dry_run: true without sending', async () => {
    const res: any = await client.callTool({
      name: 'send_email',
      arguments: {
        to: ['user@example.com'],
        subject: 'Weekly Review Test',
        body: 'Here is the summary body text.',
        dry_run: true,
      },
    });

    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.status).toBe('validated_not_sent');
    expect(data.dry_run).toBe(true);
    expect(fakeGmail.sentMessages.length).toBe(0);
  });

  it('executes send_email with dry_run: false and delivers email via GmailPort', async () => {
    const res: any = await client.callTool({
      name: 'send_email',
      arguments: {
        to: ['colleague@allowedcompany.com'],
        subject: 'Real Send Test ₹100',
        body: 'Real email body.',
        dry_run: false,
      },
    });

    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.status).toBe('sent');
    expect(data.message_id).toBe(fakeGmail.mockMessageId);
    expect(fakeGmail.sentMessages.length).toBe(1);
  });

  it('rejects send_email to disallowed recipient with RECIPIENT_NOT_ALLOWED', async () => {
    const res: any = await client.callTool({
      name: 'send_email',
      arguments: {
        to: ['evil@attacker.com'],
        subject: 'Secret Exfiltration Attempt',
        body: 'Leaked data',
        dry_run: true,
      },
    });

    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error.code).toBe('RECIPIENT_NOT_ALLOWED');
    expect(fakeGmail.sentMessages.length).toBe(0);
  });

  it('executes append_to_doc with dry_run: true without modifying doc', async () => {
    const res: any = await client.callTool({
      name: 'append_to_doc',
      arguments: {
        document_id: 'doc-12345',
        content: 'Appended line for testing.',
        dry_run: true,
      },
    });

    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.status).toBe('validated_not_sent');
    expect(data.document_id).toBe('doc-12345');
    expect(fakeDocs.batchUpdateCalls.length).toBe(0);
  });

  it('executes append_to_doc with dry_run: false and updates document', async () => {
    const res: any = await client.callTool({
      name: 'append_to_doc',
      arguments: {
        document_id: 'https://docs.google.com/document/d/doc-12345/edit',
        heading: 'Section 1',
        content: 'Entry content details.',
        separator: 'blank_line',
        dry_run: false,
      },
    });

    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.status).toBe('appended');
    expect(data.document_id).toBe('doc-12345');
    expect(fakeDocs.batchUpdateCalls.length).toBe(1);
    expect(fakeDocs.batchUpdateCalls[0].docId).toBe('doc-12345');
  });

  it('retries once and succeeds when revision conflict occurs on append_to_doc', async () => {
    fakeDocs.conflictOnFirstTry = true;

    const res: any = await client.callTool({
      name: 'append_to_doc',
      arguments: {
        document_id: 'doc-conflict',
        content: 'Concurrent append line.',
        dry_run: false,
      },
    });

    expect(res.isError).toBeFalsy();
    const data = JSON.parse(res.content[0].text);
    expect(data.status).toBe('appended');
  });

  it('returns AUTH_REQUIRED when token is missing', async () => {
    await tokenStore.clear();

    const res: any = await client.callTool({
      name: 'send_email',
      arguments: {
        to: ['user@example.com'],
        subject: 'No auth test',
        body: 'Test',
        dry_run: true,
      },
    });

    expect(res.isError).toBe(true);
    const parsed = JSON.parse(res.content[0].text);
    expect(parsed.error.code).toBe('AUTH_REQUIRED');
  });
});
