import nodemailer from 'nodemailer';
import { DomainError } from '../errors.js';

export interface BuildMessageInput {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  body_format?: 'text' | 'html';
  reply_to?: string;
}

export interface BuiltMessage {
  raw: string; // base64url encoded
  sizeBytes: number;
}

const MAX_MESSAGE_BYTES = 25 * 1024 * 1024; // 25 MB Gmail limit

function simpleHtmlToText(html: string): string {
  return html
    .replace(/<br\s*[\/]?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

export async function buildMimeMessage(input: BuildMessageInput): Promise<BuiltMessage> {
  const mailOptions: Record<string, unknown> = {
    from: input.from,
    to: input.to.join(', '),
    subject: input.subject,
    encoding: 'utf-8',
  };

  if (input.cc && input.cc.length > 0) {
    mailOptions.cc = input.cc.join(', ');
  }

  if (input.bcc && input.bcc.length > 0) {
    mailOptions.bcc = input.bcc.join(', ');
  }

  if (input.reply_to) {
    mailOptions.replyTo = input.reply_to;
  }

  if (input.body_format === 'html') {
    mailOptions.html = input.body;
    mailOptions.text = simpleHtmlToText(input.body);
  } else {
    mailOptions.text = input.body;
  }

  try {
    const transporter = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
    });

    const info: any = await transporter.sendMail(mailOptions);
    const messageBuffer: Buffer = info.message;

    const sizeBytes = messageBuffer.length;
    if (sizeBytes > MAX_MESSAGE_BYTES) {
      throw new DomainError(
        'BODY_TOO_LARGE',
        `Constructed email exceeds maximum size limit of 25MB (was ${(sizeBytes / 1024 / 1024).toFixed(2)}MB).`
      );
    }

    const raw = messageBuffer.toString('base64url');

    return {
      raw,
      sizeBytes,
    };
  } catch (err: any) {
    if (err instanceof DomainError) throw err;
    throw new DomainError('INVALID_INPUT', `Failed to construct MIME message: ${err?.message || err}`);
  }
}
