import { z } from 'zod';
import type { EmailService } from '../services/EmailService.js';
import { formatSuccessResult, formatErrorResult } from './result.js';

export const SendEmailInputShape = {
  to: z
    .array(z.string())
    .min(1)
    .max(10)
    .describe('List of primary recipient email addresses (1-10 addresses). Must match the recipient allowlist.'),
  cc: z
    .array(z.string())
    .optional()
    .describe('Optional CC recipient email addresses. Must also match the recipient allowlist.'),
  bcc: z
    .array(z.string())
    .optional()
    .describe('Optional BCC recipient email addresses. Must also match the recipient allowlist.'),
  subject: z
    .string()
    .min(1)
    .max(200)
    .describe('Email subject line (1-200 characters, no CR/LF allowed).'),
  body: z
    .string()
    .min(1)
    .max(50000)
    .describe('Email body text (1-50,000 characters).'),
  body_format: z
    .enum(['text', 'html'])
    .optional()
    .default('text')
    .describe('Format of the body content: "text" (default) or "html".'),
  reply_to: z
    .string()
    .optional()
    .describe('Optional Reply-To email address.'),
  dry_run: z
    .boolean()
    .optional()
    .describe('When true, validates inputs and builds MIME message but does not send. Defaults to server configuration.'),
};

export function createSendEmailHandler(emailService: EmailService) {
  return async (args: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    body: string;
    body_format?: 'text' | 'html';
    reply_to?: string;
    dry_run?: boolean;
  }) => {
    try {
      const result = await emailService.send(args);
      return formatSuccessResult(result);
    } catch (error) {
      return formatErrorResult(error);
    }
  };
}
