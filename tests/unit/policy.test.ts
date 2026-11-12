import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RecipientPolicy } from '../../src/policy/RecipientPolicy.js';
import { DocPolicy } from '../../src/policy/DocPolicy.js';
import { Ledger } from '../../src/state/Ledger.js';
import { PolicyEngine } from '../../src/policy/index.js';
import { DomainError } from '../../src/errors.js';
import type { Config } from '../../src/config/config.js';

describe('policy engine', () => {
  describe('RecipientPolicy', () => {
    it('defaults to authenticated email only when allowlist is empty', () => {
      const policy = new RecipientPolicy({
        allowedRecipients: [],
        maxRecipients: 5,
        authenticatedEmail: 'owner@example.com',
      });

      expect(() => policy.validate({ to: ['owner@example.com'] })).not.toThrow();
      expect(() => policy.validate({ to: ['OWNER@example.com'] })).not.toThrow();

      try {
        policy.validate({ to: ['stranger@example.com'] });
        expect.unreachable();
      } catch (err: any) {
        expect(err).toBeInstanceOf(DomainError);
        expect(err.code).toBe('RECIPIENT_NOT_ALLOWED');
      }
    });

    it('allows recipients matching exact address or domain rules in allowlist', () => {
      const policy = new RecipientPolicy({
        allowedRecipients: ['partner@vendor.com', '@mycompany.com'],
        maxRecipients: 5,
        authenticatedEmail: 'dev@gmail.com',
      });

      expect(() => policy.validate({ to: ['partner@vendor.com'] })).not.toThrow();
      expect(() => policy.validate({ to: ['alice@mycompany.com'] })).not.toThrow();
      expect(() => policy.validate({ to: ['dev@gmail.com'] })).not.toThrow();

      expect(() => policy.validate({ to: ['intruder@other.com'] })).toThrowError(DomainError);
    });

    it('enforces maximum recipient cap (to + cc + bcc)', () => {
      const policy = new RecipientPolicy({
        allowedRecipients: ['@mycompany.com'],
        maxRecipients: 3,
        authenticatedEmail: 'dev@mycompany.com',
      });

      expect(() =>
        policy.validate({
          to: ['a@mycompany.com', 'b@mycompany.com'],
          cc: ['c@mycompany.com'],
        })
      ).not.toThrow();

      try {
        policy.validate({
          to: ['a@mycompany.com', 'b@mycompany.com'],
          cc: ['c@mycompany.com', 'd@mycompany.com'],
        });
        expect.unreachable();
      } catch (err: any) {
        expect(err.code).toBe('TOO_MANY_RECIPIENTS');
      }
    });
  });

  describe('DocPolicy', () => {
    it('permits all Docs when allowedDocIds is empty', () => {
      const policy = new DocPolicy({ allowedDocIds: [] });
      expect(() => policy.validate('any-valid-doc-id-12345')).not.toThrow();
    });

    it('enforces allowedDocIds when configured', () => {
      const policy = new DocPolicy({
        allowedDocIds: ['allowed-doc-123', 'allowed-doc-456'],
      });

      expect(() => policy.validate('allowed-doc-123')).not.toThrow();

      try {
        policy.validate('disallowed-doc-999');
        expect.unreachable();
      } catch (err: any) {
        expect(err.code).toBe('DOCUMENT_NOT_ALLOWED');
      }
    });
  });

  describe('PolicyEngine master switch & dry run', () => {
    let tempDir: string;
    let ledger: Ledger;
    let mockConfig: Config;

    beforeEach(() => {
      tempDir = path.join(os.tmpdir(), `gdm-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      fs.mkdirSync(tempDir, { recursive: true });
      ledger = new Ledger(tempDir);

      mockConfig = {
        googleClientId: 'cid',
        googleClientSecret: 'csec',
        tokenPath: path.join(tempDir, 'token.json'),
        stateDir: tempDir,
        allowedRecipients: ['@test.com'],
        maxRecipients: 5,
        maxSendsPerMinute: 5,
        maxSendsPerDay: 50,
        defaultDryRun: true,
        allowLiveSend: false, // LIVE SEND DISABLED
        allowedDocIds: [],
        maxAppendPerMinute: 10,
        maxSubjectChars: 200,
        maxBodyChars: 50000,
        maxAppendChars: 100000,
        logLevel: 'info',
      };
    });

    it('permits dry run when live send is disabled', async () => {
      const engine = new PolicyEngine(mockConfig, ledger);
      const res = await engine.validateSendEmail(
        {
          to: ['user@test.com'],
          subject: 'Test subject',
          body: 'Hello test',
          dry_run: true,
        },
        'user@test.com'
      );

      expect(res.effectiveDryRun).toBe(true);
    });

    it('rejects live send (dry_run: false) when GDM_ALLOW_LIVE_SEND is false', async () => {
      const engine = new PolicyEngine(mockConfig, ledger);

      try {
        await engine.validateSendEmail(
          {
            to: ['user@test.com'],
            subject: 'Test subject',
            body: 'Hello test',
            dry_run: false,
          },
          'user@test.com'
        );
        expect.unreachable();
      } catch (err: any) {
        expect(err.code).toBe('LIVE_SEND_DISABLED');
      }
    });
  });
});
