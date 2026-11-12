import type { GmailPort, SendResult } from '../../ports/GmailPort.js';

export class FakeGmail implements GmailPort {
  public sentMessages: string[] = [];
  public shouldFailWith: Error | null = null;
  public mockMessageId = 'mock-msg-id-123';
  public mockThreadId = 'mock-thread-id-123';

  async send(rawBase64Url: string): Promise<SendResult> {
    if (this.shouldFailWith) {
      throw this.shouldFailWith;
    }
    this.sentMessages.push(rawBase64Url);
    return {
      id: this.mockMessageId,
      threadId: this.mockThreadId,
    };
  }

  reset() {
    this.sentMessages = [];
    this.shouldFailWith = null;
  }
}
