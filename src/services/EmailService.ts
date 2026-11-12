import type { PolicyEngine } from '../policy/index.js';
import type { GmailPort } from '../ports/GmailPort.js';
import type { AuthManager } from '../auth/AuthManager.js';
import type { AuditLog } from '../state/AuditLog.js';
import { buildMimeMessage } from '../mime/buildMessage.js';
import { DomainError } from '../errors.js';
import { logger } from '../logger.js';

export interface SendEmailServiceInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  body_format?: 'text' | 'html';
  reply_to?: string;
  dry_run?: boolean;
}

export interface SendEmailServiceOutput {
  status: 'sent' | 'validated_not_sent';
  message_id?: string;
  thread_id?: string;
  recipients: {
    to: number;
    cc: number;
    bcc: number;
  };
  message_size_bytes?: number;
  dry_run: boolean;
}

export class EmailService {
  constructor(
    private readonly policyEngine: PolicyEngine,
    private readonly gmailPort: GmailPort,
    private readonly authManager: AuthManager,
    private readonly auditLog: AuditLog
  ) {}

  async send(input: SendEmailServiceInput): Promise<SendEmailServiceOutput> {
    const startTime = Date.now();
    const recipientCount = input.to.length + (input.cc?.length || 0) + (input.bcc?.length || 0);

    try {
      // Ensure caller is authenticated (throws AUTH_REQUIRED if tokens missing/invalid)
      await this.authManager.getAuthenticatedClient();

      const authEmail = await this.authManager.getAccountEmail();
      const fromAddress = authEmail || 'me';

      // 1. Policy & safety validation
      const { effectiveDryRun } = await this.policyEngine.validateSendEmail(input, authEmail);

      // 2. Build standards-compliant MIME message
      const built = await buildMimeMessage({
        from: fromAddress,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        body: input.body,
        body_format: input.body_format,
        reply_to: input.reply_to,
      });

      // 3. Dry-run execution path
      if (effectiveDryRun) {
        await this.auditLog.record({
          tool: 'send_email',
          status: 'validated_not_sent',
          outcome: 'validated_not_sent',
          duration_ms: Date.now() - startTime,
          recipient_count: recipientCount,
          chars: input.body.length,
          dry_run: true,
        });

        logger.info({
          tool: 'send_email',
          status: 'validated_not_sent',
          recipient_count: recipientCount,
          dry_run: true,
          duration_ms: Date.now() - startTime,
        });

        return {
          status: 'validated_not_sent',
          recipients: {
            to: input.to.length,
            cc: input.cc?.length || 0,
            bcc: input.bcc?.length || 0,
          },
          message_size_bytes: built.sizeBytes,
          dry_run: true,
        };
      }

      // 4. Live send execution path
      const result = await this.gmailPort.send(built.raw);

      // Record rate limit counter only upon successful send
      await this.policyEngine.getRateLimiter().recordSend();

      await this.auditLog.record({
        tool: 'send_email',
        status: 'sent',
        outcome: 'sent',
        duration_ms: Date.now() - startTime,
        recipient_count: recipientCount,
        chars: input.body.length,
        dry_run: false,
        message_id: result.id,
      });

      logger.info({
        tool: 'send_email',
        status: 'sent',
        recipient_count: recipientCount,
        dry_run: false,
        message_id: result.id,
        duration_ms: Date.now() - startTime,
      });

      return {
        status: 'sent',
        message_id: result.id,
        thread_id: result.threadId,
        recipients: {
          to: input.to.length,
          cc: input.cc?.length || 0,
          bcc: input.bcc?.length || 0,
        },
        dry_run: false,
      };
    } catch (err: any) {
      const errorCode = err instanceof DomainError ? err.code : 'INTERNAL_ERROR';

      await this.auditLog.record({
        tool: 'send_email',
        status: 'rejected',
        outcome: 'rejected',
        duration_ms: Date.now() - startTime,
        recipient_count: recipientCount,
        error_code: errorCode,
      });

      logger.warn({
        tool: 'send_email',
        status: 'rejected',
        error_code: errorCode,
        duration_ms: Date.now() - startTime,
      });

      throw err;
    }
  }
}
