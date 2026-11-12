import { google } from 'googleapis';
import type { DocsPort, DocEndState } from '../../ports/DocsPort.js';
import type { AuthManager } from '../../auth/AuthManager.js';
import { mapGoogleError } from './errorMap.js';

export class GoogleDocsAdapter implements DocsPort {
  constructor(private readonly authManager: AuthManager) {}

  async getEndState(docId: string): Promise<DocEndState> {
    try {
      const auth = await this.authManager.getAuthenticatedClient();
      const docs = google.docs({ version: 'v1', auth });

      // Request minimal metadata and body content to extract endIndex and revisionId
      const res = await docs.documents.get({
        documentId: docId,
        fields: 'revisionId,title,body.content.endIndex',
      });

      const data = res.data;
      const revisionId = data.revisionId || '';
      const title = data.title || 'Untitled Document';

      let endIndex = 1;
      const content = data.body?.content;
      if (Array.isArray(content) && content.length > 0) {
        const lastElement = content[content.length - 1];
        if (typeof lastElement.endIndex === 'number') {
          endIndex = lastElement.endIndex;
        }
      }

      return {
        endIndex,
        revisionId,
        title,
      };
    } catch (err) {
      throw mapGoogleError(err, 'docs');
    }
  }

  async batchUpdate(
    docId: string,
    requests: any[],
    requiredRevisionId?: string
  ): Promise<{ documentId: string }> {
    try {
      const auth = await this.authManager.getAuthenticatedClient();
      const docs = google.docs({ version: 'v1', auth });

      const requestBody: Record<string, unknown> = {
        requests,
      };

      if (requiredRevisionId) {
        requestBody.writeControl = {
          requiredRevisionId,
        };
      }

      const res = await docs.documents.batchUpdate({
        documentId: docId,
        requestBody,
      });

      return {
        documentId: res.data.documentId || docId,
      };
    } catch (err) {
      throw mapGoogleError(err, 'docs');
    }
  }
}
