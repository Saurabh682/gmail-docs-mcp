import { DomainError } from '../errors.js';
import { validateNoCRLF, isValidEmail } from './validators.js';

export interface RecipientPolicyOptions {
  allowedRecipients: string[];
  maxRecipients: number;
  authenticatedEmail?: string | null;
}

export class RecipientPolicy {
  constructor(private readonly options: RecipientPolicyOptions) {}

  validate(recipients: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    reply_to?: string;
  }): void {
    const { to, cc = [], bcc = [], reply_to } = recipients;

    if (!to || to.length === 0) {
      throw new DomainError('INVALID_RECIPIENT', 'At least one recipient must be specified in the "to" field.');
    }

    const allRecipients = [...to, ...cc, ...bcc];
    const totalCount = allRecipients.length;

    if (totalCount > this.options.maxRecipients) {
      throw new DomainError(
        'TOO_MANY_RECIPIENTS',
        `Combined recipients count (${totalCount}) exceeds maximum permitted cap of ${this.options.maxRecipients}.`
      );
    }

    if (reply_to) {
      validateNoCRLF(reply_to, 'reply_to');
      if (!isValidEmail(reply_to)) {
        throw new DomainError('INVALID_RECIPIENT', `Invalid email format in reply_to address: "${reply_to}".`);
      }
    }

    const normalizedAllowlist = this.options.allowedRecipients.map((r) => r.toLowerCase().trim());
    const authEmail = this.options.authenticatedEmail?.toLowerCase().trim();

    for (const rawEmail of allRecipients) {
      validateNoCRLF(rawEmail, 'recipient');

      if (!isValidEmail(rawEmail)) {
        throw new DomainError('INVALID_RECIPIENT', `Invalid email address syntax: "${rawEmail}".`);
      }

      const email = rawEmail.toLowerCase().trim();
      const isAllowed = this.checkAllowed(email, normalizedAllowlist, authEmail);

      if (!isAllowed) {
        throw new DomainError(
          'RECIPIENT_NOT_ALLOWED',
          `Recipient "${rawEmail}" is not permitted by the server's recipient policy allowlist.`
        );
      }
    }
  }

  private checkAllowed(email: string, allowlist: string[], authEmail?: string): boolean {
    // If allowlist is empty, default strictly to the authenticated account's own email
    if (allowlist.length === 0) {
      return Boolean(authEmail && email === authEmail);
    }

    // Match against authenticated email
    if (authEmail && email === authEmail) {
      return true;
    }

    for (const rule of allowlist) {
      if (rule.startsWith('@')) {
        // Domain match, e.g. @company.com
        if (email.endsWith(rule)) {
          return true;
        }
      } else if (email === rule) {
        // Exact email match
        return true;
      }
    }

    return false;
  }
}
