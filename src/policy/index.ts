import type { Config } from '../config/config.js';
import type { LedgerInterface } from '../state/Ledger.js';
import { DomainError } from '../errors.js';
import { RecipientPolicy } from './RecipientPolicy.js';
import { DocPolicy } from './DocPolicy.js';
import { RateLimiter } from './RateLimiter.js';
import { validateNoCRLF, validateLength, extractDocumentId } from './validators.js';

export interface SendEmailPolicyInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  reply_to?: string;
  dry_run?: boolean;
}

export interface AppendToDocPolicyInput {
  document_id: string;
  content: string;
  dry_run?: boolean;
}

export class PolicyEngine {
  private readonly rateLimiter: RateLimiter;
  private readonly docPolicy: DocPolicy;

  constructor(
    private readonly config: Config,
    private readonly ledger: LedgerInterface
  ) {
    this.rateLimiter = new RateLimiter(ledger, {
      maxSendsPerMinute: config.maxSendsPerMinute,
      maxSendsPerDay: config.maxSendsPerDay,
      maxAppendPerMinute: config.maxAppendPerMinute,
    });
    this.docPolicy = new DocPolicy({
      allowedDocIds: config.allowedDocIds,
    });
  }

  /**
   * Evaluates all policy gates for send_email in the exact order specified in Architecture §7.2:
   * 1. CR/LF check on subject & addresses
   * 2. Recipient count <= max
   * 3. Recipient allowlist check
   * 4. Size caps (subject, body)
   * 5. Rate limit window
   * 6. Dry run check
   * 7. Live send switch check
   */
  async validateSendEmail(
    input: SendEmailPolicyInput,
    authenticatedEmail: string | null
  ): Promise<{ effectiveDryRun: boolean }> {
    // 1. CR/LF validation on subject
    validateNoCRLF(input.subject, 'subject');

    // 2 & 3. Recipient policy validation (syntax, CR/LF, count, allowlist)
    const recipientPolicy = new RecipientPolicy({
      allowedRecipients: this.config.allowedRecipients,
      maxRecipients: this.config.maxRecipients,
      authenticatedEmail,
    });
    recipientPolicy.validate({
      to: input.to,
      cc: input.cc,
      bcc: input.bcc,
      reply_to: input.reply_to,
    });

    // 4. Size caps
    validateLength(input.subject, 1, this.config.maxSubjectChars, 'Subject', 'INVALID_SUBJECT');
    validateLength(input.body, 1, this.config.maxBodyChars, 'Body', 'BODY_TOO_LARGE');

    // Determine effective dry run
    const effectiveDryRun = input.dry_run !== undefined ? input.dry_run : this.config.defaultDryRun;

    // 5. Rate limit check (enforced on both dry-run and live, but only live increments counters)
    await this.rateLimiter.checkSendLimit();

    // 6 & 7. If live send requested, check master switch
    if (!effectiveDryRun && !this.config.allowLiveSend) {
      throw new DomainError(
        'LIVE_SEND_DISABLED',
        'Live email sending is disabled by configuration (GDM_ALLOW_LIVE_SEND=false). Run with dry_run: true or enable live send.',
        false,
        'Set GDM_ALLOW_LIVE_SEND=true in server environment variables to permit live email delivery.'
      );
    }

    return { effectiveDryRun };
  }

  /**
   * Evaluates all policy gates for append_to_doc in order (§7.3):
   * 1. Doc ID extraction/validation
   * 2. Doc allowlist check
   * 3. Size caps
   * 4. Append rate limit check
   */
  async validateAppendToDoc(
    input: AppendToDocPolicyInput
  ): Promise<{ docId: string; effectiveDryRun: boolean }> {
    // 1. Extract clean Document ID
    const docId = extractDocumentId(input.document_id);

    // 2. Doc allowlist
    this.docPolicy.validate(docId);

    // 3. Content size limit
    validateLength(input.content, 1, this.config.maxAppendChars, 'Content', 'CONTENT_TOO_LARGE');

    // Determine effective dry run
    const effectiveDryRun = input.dry_run !== undefined ? input.dry_run : this.config.defaultDryRun;

    // 4. Rate limit
    await this.rateLimiter.checkAppendLimit();

    return { docId, effectiveDryRun };
  }

  getRateLimiter(): RateLimiter {
    return this.rateLimiter;
  }
}
