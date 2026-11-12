import { describe, it, expect } from 'vitest';
import { mapGoogleError } from '../../src/adapters/google/errorMap.js';

describe('mapGoogleError', () => {
  it('maps 401 to AUTH_REQUIRED (not retryable)', () => {
    const err = { status: 401, message: 'Unauthorized' };
    const domainErr = mapGoogleError(err, 'gmail');
    expect(domainErr.code).toBe('AUTH_REQUIRED');
    expect(domainErr.retryable).toBe(false);
  });

  it('maps invalid_grant to AUTH_REQUIRED', () => {
    const err = { response: { data: { error: 'invalid_grant' } } };
    const domainErr = mapGoogleError(err, 'gmail');
    expect(domainErr.code).toBe('AUTH_REQUIRED');
    expect(domainErr.retryable).toBe(false);
  });

  it('maps 403 insufficient scopes to AUTH_REQUIRED', () => {
    const err = {
      status: 403,
      message: 'Request had insufficient authentication scopes.',
    };
    const domainErr = mapGoogleError(err, 'docs');
    expect(domainErr.code).toBe('AUTH_REQUIRED');
  });

  it('maps 403 permission denied to PERMISSION_DENIED', () => {
    const err = {
      status: 403,
      message: 'The caller does not have permission',
    };
    const domainErr = mapGoogleError(err, 'docs');
    expect(domainErr.code).toBe('PERMISSION_DENIED');
  });

  it('maps 404 to DOCUMENT_NOT_FOUND', () => {
    const err = { status: 404, message: 'Requested document was not found' };
    const domainErr = mapGoogleError(err, 'docs');
    expect(domainErr.code).toBe('DOCUMENT_NOT_FOUND');
    expect(domainErr.retryable).toBe(false);
  });

  it('maps 409 revision mismatch to DOC_CONFLICT (retryable)', () => {
    const err = { status: 409, message: 'revisionId mismatch' };
    const domainErr = mapGoogleError(err, 'docs');
    expect(domainErr.code).toBe('DOC_CONFLICT');
    expect(domainErr.retryable).toBe(true);
  });

  it('maps 429 quota exceeded to QUOTA_EXCEEDED (retryable)', () => {
    const err = { status: 429, message: 'Rate limit exceeded' };
    const domainErr = mapGoogleError(err, 'gmail');
    expect(domainErr.code).toBe('QUOTA_EXCEEDED');
    expect(domainErr.retryable).toBe(true);
  });

  it('maps network connection errors to NETWORK_ERROR (retryable)', () => {
    const err = { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 142.250.190.42:443' };
    const domainErr = mapGoogleError(err, 'gmail');
    expect(domainErr.code).toBe('NETWORK_ERROR');
    expect(domainErr.retryable).toBe(true);
  });

  it('maps timeouts to TIMEOUT (not retryable due to unknown outcome)', () => {
    const err = { code: 'ETIMEDOUT', message: 'connection timed out' };
    const domainErr = mapGoogleError(err, 'gmail');
    expect(domainErr.code).toBe('TIMEOUT');
    expect(domainErr.retryable).toBe(false);
  });
});
