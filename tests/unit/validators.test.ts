import { describe, it, expect } from 'vitest';
import { validateNoCRLF, isValidEmail, extractDocumentId, validateLength } from '../../src/policy/validators.js';
import { DomainError } from '../../src/errors.js';

describe('validators', () => {
  describe('validateNoCRLF', () => {
    it('accepts clean strings', () => {
      expect(() => validateNoCRLF('Clean subject line', 'subject')).not.toThrow();
      expect(() => validateNoCRLF('user@example.com', 'to')).not.toThrow();
    });

    it('rejects strings containing \\r or \\n in subject with INVALID_SUBJECT', () => {
      expect(() => validateNoCRLF('Bad\rSubject', 'subject')).toThrowError(DomainError);
      try {
        validateNoCRLF('Bad\nSubject', 'subject');
      } catch (err: any) {
        expect(err.code).toBe('INVALID_SUBJECT');
      }
    });

    it('rejects strings containing \\r or \\n in other fields with INVALID_INPUT', () => {
      try {
        validateNoCRLF('user@example.com\r\nBcc: evil@example.com', 'recipient');
      } catch (err: any) {
        expect(err.code).toBe('INVALID_INPUT');
      }
    });
  });

  describe('isValidEmail', () => {
    it('validates standard email addresses', () => {
      expect(isValidEmail('alice@example.com')).toBe(true);
      expect(isValidEmail('bob.smith+tag@sub.domain.co.uk')).toBe(true);
    });

    it('rejects invalid email formats', () => {
      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('missing@tld')).toBe(false);
      expect(isValidEmail('spaces in@email.com')).toBe(false);
      expect(isValidEmail('crlf@email.com\n')).toBe(false);
    });
  });

  describe('extractDocumentId', () => {
    it('extracts ID from standard Google Docs URL', () => {
      const url = 'https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit';
      expect(extractDocumentId(url)).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
    });

    it('extracts ID from Google Docs URL with user index and query params', () => {
      const url = 'https://docs.google.com/document/u/0/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing';
      expect(extractDocumentId(url)).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
    });

    it('accepts raw document ID', () => {
      const rawId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
      expect(extractDocumentId(rawId)).toBe(rawId);
    });

    it('throws INVALID_DOCUMENT_ID on invalid inputs', () => {
      expect(() => extractDocumentId('')).toThrowError(DomainError);
      expect(() => extractDocumentId('abc')).toThrowError(DomainError);
      expect(() => extractDocumentId('invalid with spaces')).toThrowError(DomainError);
      try {
        extractDocumentId('not valid!');
      } catch (err: any) {
        expect(err.code).toBe('INVALID_DOCUMENT_ID');
      }
    });
  });

  describe('validateLength', () => {
    it('accepts valid length', () => {
      expect(() => validateLength('hello', 1, 10, 'field')).not.toThrow();
    });

    it('throws when string is too short or too long', () => {
      expect(() => validateLength('', 1, 10, 'field')).toThrowError(DomainError);
      expect(() => validateLength('12345678901', 1, 10, 'field')).toThrowError(DomainError);
    });
  });
});
