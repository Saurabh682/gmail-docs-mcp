import { google } from 'googleapis';
import type { GmailPort, SendResult } from '../../ports/GmailPort.js';
import type { AuthManager } from '../../auth/AuthManager.js';
import { mapGoogleError } from './errorMap.js';

export class GoogleGmailAdapter implements GmailPort {
  constructor(private readonly authManager: AuthManager) {}

  async send(rawBase64Url: string): Promise<SendResult> {
    try {
      const auth = await this.authManager.getAuthenticatedClient();
      const gmail = google.gmail({ version: 'v1', auth });

      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: rawBase64Url,
        },
      });

      const { id, threadId } = response.data;
      if (!id) {
        throw new Error('Gmail API response did not contain a message ID.');
      }

      return {
        id,
        threadId: threadId || id,
      };
    } catch (err) {
      throw mapGoogleError(err, 'gmail');
    }
  }
}
