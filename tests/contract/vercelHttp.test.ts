import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { createHttpApp, type AppContext } from '../../src/http/app.js';
import { FakeGmail } from '../../src/adapters/fake/FakeGmail.js';
import { FakeDocs } from '../../src/adapters/fake/FakeDocs.js';
import type { Config } from '../../src/config/config.js';

describe('Vercel Serverless HTTP Endpoint Contract Tests', () => {
  let server: http.Server;
  let port: number;
  let baseUrl: string;
  let fakeGmail: FakeGmail;
  let fakeDocs: FakeDocs;
  let tempDir: string;
  const TEST_API_KEY = 'vercel-test-secret-key-12345';

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `gdm-vercel-http-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    fakeGmail = new FakeGmail();
    fakeDocs = new FakeDocs();
    fakeDocs.setDoc('doc-http-123', {
      title: 'HTTP Test Doc',
      revisionId: 'rev-http-1',
      endIndex: 10,
    });

    const config: Config = {
      googleClientId: 'test-client-id',
      googleClientSecret: 'test-client-secret',
      tokenPath: path.join(tempDir, 'token.json'),
      stateDir: tempDir,
      allowedRecipients: ['user@example.com'],
      maxRecipients: 5,
      maxSendsPerMinute: 10,
      maxSendsPerDay: 50,
      defaultDryRun: true,
      allowLiveSend: true,
      allowedDocIds: ['doc-http-123'],
      maxAppendPerMinute: 10,
      maxSubjectChars: 200,
      maxBodyChars: 50000,
      maxAppendChars: 100000,
      logLevel: 'debug',
      serverApiKey: TEST_API_KEY,
      googleRefreshToken: 'test-refresh-token',
      accountEmail: 'user@example.com',
      isServerless: true,
    };

    const appContext: AppContext = await createHttpApp({
      config,
      gmailPort: fakeGmail,
      docsPort: fakeDocs,
    });

    server = http.createServer((req, res) => {
      appContext.handleNodeRequest(req, res).catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeRequest(
    method: string,
    reqPath: string,
    headers: Record<string, string> = {},
    body?: string
  ): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
    return new Promise((resolve, reject) => {
      const req = http.request(
        `${baseUrl}${reqPath}`,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json, text/event-stream',
            ...headers,
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body: data }));
        }
      );
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  it('GET /api/health responds with 200 without requiring Bearer auth', async () => {
    const res = await makeRequest('GET', '/api/health');
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.status).toBe('ok');
    expect(parsed.server).toBe('gmail-docs-mcp');
    expect(parsed.mode).toBe('serverless');
  });

  it('POST /api/mcp rejects unauthenticated requests with 401', async () => {
    const res = await makeRequest('POST', '/api/mcp', {}, JSON.stringify({ jsonrpc: '2.0', id: 1 }));
    expect(res.status).toBe(401);
    const parsed = JSON.parse(res.body);
    expect(parsed.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/mcp accepts valid Authorization: Bearer token and responds to initialize', async () => {
    const initPayload = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'vercel-test-client', version: '1.0.0' },
      },
    });

    const res = await makeRequest(
      'POST',
      '/api/mcp',
      {
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      initPayload
    );

    expect(res.status).toBe(200);
    expect(res.body).toContain('"protocolVersion":"2024-11-05"');
    expect(res.body).toContain('"name":"gmail-docs-mcp"');
  });

  it('executes tools/call send_email over HTTP with dry_run: true', async () => {
    const callPayload = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'send_email',
        arguments: {
          to: ['user@example.com'],
          subject: 'HTTP Vercel Test',
          body: 'Content sent via serverless HTTP endpoint.',
          dry_run: true,
        },
      },
    });

    const res = await makeRequest(
      'POST',
      '/api/mcp',
      {
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      callPayload
    );

    expect(res.status).toBe(200);
    expect(res.body).toContain('"status":"validated_not_sent"');
    expect(fakeGmail.sentMessages.length).toBe(0);
  });

  it('executes tools/call append_to_doc over HTTP with dry_run: true', async () => {
    const callPayload = JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'append_to_doc',
        arguments: {
          document_id: 'doc-http-123',
          content: 'Appended line over Vercel HTTP.',
          dry_run: true,
        },
      },
    });

    const res = await makeRequest(
      'POST',
      '/api/mcp',
      {
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      callPayload
    );

    expect(res.status).toBe(200);
    expect(res.body).toContain('"status":"validated_not_sent"');
    expect(res.body).toContain('doc-http-123');
  });
});
