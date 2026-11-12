export interface SendResult {
  id: string;
  threadId: string;
}

export interface GmailPort {
  send(rawBase64Url: string): Promise<SendResult>;
}
