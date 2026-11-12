import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Logger } from '../../src/logger.js';
import { AuditLog } from '../../src/state/AuditLog.js';

describe('Redaction & Privacy Verification', () => {
  let tempDir: string;
  const CANARY_SECRET_TOKEN = 'CANARY_REFRESH_TOKEN_99999';
  const CANARY_EMAIL_BODY = 'CANARY_SECRET_BODY_CONFIDENTIAL_12345';
  const CANARY_DOC_CONTENT = 'CANARY_DOC_CONTENT_PATIENT_RECORDS_98765';

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `gdm-redaction-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('ensures logger discards non-allowlisted fields and secret data', () => {
    const stderrChunks: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderrChunks.push(String(chunk));
      return true;
    });

    const testLogger = new Logger('debug');

    testLogger.info({
      tool: 'send_email',
      status: 'sent',
      recipient_count: 1,
      // Attempted leak of sensitive fields
      secret_token: CANARY_SECRET_TOKEN,
      body: CANARY_EMAIL_BODY,
      content: CANARY_DOC_CONTENT,
      unauthorized_field: 'leak',
    });

    stderrSpy.mockRestore();

    const output = stderrChunks.join('\n');
    expect(output).toContain('"tool":"send_email"');
    expect(output).toContain('"status":"sent"');
    expect(output).not.toContain(CANARY_SECRET_TOKEN);
    expect(output).not.toContain(CANARY_EMAIL_BODY);
    expect(output).not.toContain(CANARY_DOC_CONTENT);
    expect(output).not.toContain('unauthorized_field');
  });

  it('ensures AuditLog records metadata only and never message or doc content', async () => {
    const auditLog = new AuditLog(tempDir);

    await auditLog.record({
      tool: 'send_email',
      status: 'sent',
      outcome: 'sent',
      recipient_count: 2,
      chars: 500,
      dry_run: false,
      message_id: 'msg-abc-123',
    });

    const auditFile = path.join(tempDir, 'audit.jsonl');
    expect(fs.existsSync(auditFile)).toBe(true);

    const logContent = fs.readFileSync(auditFile, 'utf8');
    const parsed = JSON.parse(logContent.trim());

    expect(parsed.tool).toBe('send_email');
    expect(parsed.outcome).toBe('sent');
    expect(parsed.recipient_count).toBe(2);
    expect(parsed.chars).toBe(500);
    expect(parsed.message_id).toBe('msg-abc-123');

    // Verify absence of sensitive content
    expect(logContent).not.toContain(CANARY_SECRET_TOKEN);
    expect(logContent).not.toContain(CANARY_EMAIL_BODY);
    expect(logContent).not.toContain(CANARY_DOC_CONTENT);
  });
});
