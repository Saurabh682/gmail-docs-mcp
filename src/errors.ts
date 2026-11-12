/**
 * Domain error codes as specified in Architecture §10.1
 */
export type ErrorCode =
  // Validation / Policy (client error, not retryable)
  | 'INVALID_INPUT'
  | 'INVALID_RECIPIENT'
  | 'RECIPIENT_NOT_ALLOWED'
  | 'TOO_MANY_RECIPIENTS'
  | 'INVALID_SUBJECT'
  | 'BODY_TOO_LARGE'
  | 'CONTENT_TOO_LARGE'
  | 'INVALID_DOCUMENT_ID'
  | 'DOCUMENT_NOT_ALLOWED'
  | 'LIVE_SEND_DISABLED'
  | 'RATE_LIMITED_LOCAL'
  // Auth / Permissions
  | 'AUTH_REQUIRED'
  | 'PERMISSION_DENIED'
  // Remote
  | 'DOCUMENT_NOT_FOUND'
  | 'QUOTA_EXCEEDED'
  | 'DOC_CONFLICT'
  | 'GMAIL_API_ERROR'
  | 'DOCS_API_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  // Internal
  | 'STATE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class DomainError extends Error {
  public readonly code: ErrorCode;
  public readonly retryable: boolean;
  public readonly hint?: string;

  constructor(code: ErrorCode, message: string, retryable = false, hint?: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.retryable = retryable;
    this.hint = hint;
    Object.setPrototypeOf(this, DomainError.prototype);
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.hint ? { hint: this.hint } : {})
    };
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
