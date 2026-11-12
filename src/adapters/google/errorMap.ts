import { DomainError } from '../../errors.js';

export function mapGoogleError(error: any, service: 'gmail' | 'docs'): DomainError {
  if (error instanceof DomainError) {
    return error;
  }

  const status = error?.status || error?.code || error?.response?.status;
  const message = error?.message || String(error);
  const dataError = error?.response?.data?.error;
  const detailedMessage =
    typeof dataError === 'string'
      ? dataError
      : dataError?.message || message;

  // 401 Unauthorized / invalid_grant
  if (status === 401 || detailedMessage.includes('invalid_grant')) {
    return new DomainError(
      'AUTH_REQUIRED',
      'Google authentication expired or invalid. Please re-authenticate.',
      false,
      'Run "npm run auth" to re-authenticate with Google.'
    );
  }

  // 403 Forbidden
  if (status === 403) {
    if (detailedMessage.toLowerCase().includes('insufficient authentication scopes')) {
      return new DomainError(
        'AUTH_REQUIRED',
        'Google OAuth token has insufficient scopes for this operation. Please re-authenticate.',
        false,
        'Run "npm run auth" to update authorization scopes.'
      );
    }
    return new DomainError(
      'PERMISSION_DENIED',
      `Google permission denied: ${detailedMessage}`,
      false
    );
  }

  // 404 Not Found
  if (status === 404) {
    return new DomainError(
      'DOCUMENT_NOT_FOUND',
      `Target resource not found: ${detailedMessage}`,
      false
    );
  }

  // 409 Conflict / Revision mismatch
  if (status === 409 || detailedMessage.includes('revisionId') || detailedMessage.includes('mismatch')) {
    return new DomainError(
      'DOC_CONFLICT',
      'The document was modified concurrently. Revision conflict occurred.',
      true,
      'The operation can be retried.'
    );
  }

  // 429 Rate / Quota Limit
  if (status === 429 || detailedMessage.toLowerCase().includes('quota') || detailedMessage.toLowerCase().includes('rate limit')) {
    return new DomainError(
      'QUOTA_EXCEEDED',
      `Google API quota or rate limit exceeded: ${detailedMessage}`,
      true,
      'Retry after a backoff delay.'
    );
  }

  // Network / Connection Error
  if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN') {
    return new DomainError(
      'NETWORK_ERROR',
      `Network connectivity failure: ${detailedMessage}`,
      true,
      'Check network connectivity and retry.'
    );
  }

  // Timeout Error
  if (error?.code === 'ETIMEDOUT' || error?.code === 'ESOCKETTIMEDOUT' || detailedMessage.includes('timeout')) {
    return new DomainError(
      'TIMEOUT',
      `Google API request timed out: outcome unknown. Verify side effects before retrying.`,
      false,
      'Check Google Docs or Gmail Sent before retrying.'
    );
  }

  // 5xx Server Error
  if (typeof status === 'number' && status >= 500 && status < 600) {
    const code = service === 'gmail' ? 'GMAIL_API_ERROR' : 'DOCS_API_ERROR';
    return new DomainError(
      code,
      `Google remote server error (${status}): outcome unknown.`,
      false,
      'Check remote service state before retrying.'
    );
  }

  const defaultCode = service === 'gmail' ? 'GMAIL_API_ERROR' : 'DOCS_API_ERROR';
  return new DomainError(defaultCode, detailedMessage, false);
}
