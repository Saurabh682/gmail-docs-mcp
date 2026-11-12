import type { DocsPort, DocEndState } from '../../ports/DocsPort.js';
import { DomainError } from '../../errors.js';

interface FakeDocRecord {
  title: string;
  revisionId: string;
  endIndex: number;
}

export class FakeDocs implements DocsPort {
  public docs = new Map<string, FakeDocRecord>();
  public batchUpdateCalls: Array<{ docId: string; requests: any[]; revisionId?: string }> = [];
  public shouldFailWith: Error | null = null;
  public conflictOnFirstTry = false;

  constructor() {
    // Default test doc
    this.docs.set('default-test-doc-id', {
      title: 'Default Test Doc',
      revisionId: 'rev-1',
      endIndex: 2,
    });
  }

  setDoc(docId: string, state: FakeDocRecord) {
    this.docs.set(docId, state);
  }

  async getEndState(docId: string): Promise<DocEndState> {
    if (this.shouldFailWith) {
      throw this.shouldFailWith;
    }
    const doc = this.docs.get(docId);
    if (!doc) {
      throw new DomainError('DOCUMENT_NOT_FOUND', `Document with ID ${docId} not found.`);
    }
    return {
      endIndex: doc.endIndex,
      revisionId: doc.revisionId,
      title: doc.title,
    };
  }

  async batchUpdate(
    docId: string,
    requests: any[],
    requiredRevisionId?: string
  ): Promise<{ documentId: string }> {
    if (this.shouldFailWith) {
      throw this.shouldFailWith;
    }

    const doc = this.docs.get(docId);
    if (!doc) {
      throw new DomainError('DOCUMENT_NOT_FOUND', `Document with ID ${docId} not found.`);
    }

    if (this.conflictOnFirstTry) {
      this.conflictOnFirstTry = false;
      throw new DomainError('DOC_CONFLICT', 'Revision mismatch simulation.', true);
    }

    if (requiredRevisionId && requiredRevisionId !== doc.revisionId) {
      throw new DomainError('DOC_CONFLICT', 'Revision mismatch on batch update.', true);
    }

    this.batchUpdateCalls.push({ docId, requests, revisionId: requiredRevisionId });

    // Advance endIndex based on inserted text
    let addedChars = 0;
    for (const req of requests) {
      if (req.insertText?.text) {
        addedChars += req.insertText.text.length;
      }
    }

    doc.endIndex += addedChars;
    doc.revisionId = `rev-${Date.now()}`;

    return { documentId: docId };
  }

  reset() {
    this.docs.clear();
    this.batchUpdateCalls = [];
    this.shouldFailWith = null;
    this.conflictOnFirstTry = false;
  }
}
