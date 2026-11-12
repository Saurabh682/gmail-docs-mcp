import { DomainError } from '../errors.js';

export interface DocPolicyOptions {
  allowedDocIds: string[];
}

export class DocPolicy {
  constructor(private readonly options: DocPolicyOptions) {}

  validate(docId: string): void {
    if (!this.options.allowedDocIds || this.options.allowedDocIds.length === 0) {
      return; // Any accessible Doc is allowed when allowlist is unset
    }

    const normalizedDocId = docId.trim();
    const isAllowed = this.options.allowedDocIds.some(
      (allowed) => allowed.trim() === normalizedDocId
    );

    if (!isAllowed) {
      throw new DomainError(
        'DOCUMENT_NOT_ALLOWED',
        `Document ID "${docId}" is not in the configured ALLOWED_DOC_IDS allowlist.`
      );
    }
  }
}
