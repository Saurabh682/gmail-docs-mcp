import { DomainError } from '../errors.js';

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export function validateNoCRLF(value: string, fieldName: string): void {
  if (/[\r\n]/.test(value)) {
    if (fieldName.toLowerCase() === 'subject') {
      throw new DomainError('INVALID_SUBJECT', 'Subject line must not contain CR or LF characters.');
    }
    throw new DomainError('INVALID_INPUT', `${fieldName} must not contain CR or LF characters.`);
  }
}

export function isValidEmail(email: string): boolean {
  if (!email || /[\r\n\t]/.test(email)) return false;
  return EMAIL_REGEX.test(email.trim());
}

/**
 * Extracts and validates a Google Doc ID from a raw ID or full Docs URL.
 * Example URLs:
 * - https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 * - https://docs.google.com/document/u/0/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing
 */
export function extractDocumentId(input: string): string {
  if (!input || typeof input !== 'string') {
    throw new DomainError('INVALID_DOCUMENT_ID', 'Document ID or URL must be a non-empty string.');
  }

  const trimmed = input.trim();

  // Try extracting from Docs URL
  const urlMatch = trimmed.match(/\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  // Validate raw Doc ID format (alphanumeric, dashes, underscores)
  if (/^[a-zA-Z0-9-_]{5,}$/.test(trimmed)) {
    return trimmed;
  }

  throw new DomainError(
    'INVALID_DOCUMENT_ID',
    `Invalid Google Doc ID or URL format: "${trimmed}". Provide either the Doc ID or the full URL.`
  );
}

export function validateLength(
  value: string,
  min: number,
  max: number,
  fieldName: string,
  code: 'INVALID_SUBJECT' | 'BODY_TOO_LARGE' | 'CONTENT_TOO_LARGE' | 'INVALID_INPUT' = 'INVALID_INPUT'
): void {
  const len = value.length;
  if (len < min) {
    throw new DomainError(code, `${fieldName} must be at least ${min} characters.`);
  }
  if (len > max) {
    throw new DomainError(code, `${fieldName} exceeds maximum permitted length of ${max} characters (was ${len}).`);
  }
}
