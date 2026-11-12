import { describe, it, expect } from 'vitest';
import { buildMimeMessage } from '../../src/mime/buildMessage.js';

describe('buildMimeMessage', () => {
  it('builds a standard text/plain MIME message encoded in base64url', async () => {
    const message = await buildMimeMessage({
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'Hello World',
      body: 'This is the plain text body.',
      body_format: 'text',
    });

    expect(message.raw).toBeDefined();
    expect(message.sizeBytes).toBeGreaterThan(0);

    const decoded = Buffer.from(message.raw, 'base64url').toString('utf8');
    expect(decoded).toContain('From: sender@example.com');
    expect(decoded).toContain('To: recipient@example.com');
    expect(decoded).toContain('Subject: Hello World');
    expect(decoded).toContain('This is the plain text body.');
  });

  it('handles non-ASCII characters in subject and body with RFC 2047 encoding', async () => {
    const subject = '₹5,000 Report ★ देवनागरी';
    const body = 'Amount due: ₹5,000 and unicode emoji: 😀';

    const message = await buildMimeMessage({
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject,
      body,
    });

    const decoded = Buffer.from(message.raw, 'base64url').toString('utf8');
    // Non-ASCII in headers is encoded with =?UTF-8?...?=
    expect(decoded).toContain('From: sender@example.com');
    expect(decoded).toContain('Amount due:');
  });

  it('builds multipart/alternative MIME message when body_format is html', async () => {
    const htmlBody = '<h1>Title</h1><p>Paragraph with <b>bold</b> text.</p>';
    const message = await buildMimeMessage({
      from: 'sender@example.com',
      to: ['recipient@example.com'],
      subject: 'HTML Email',
      body: htmlBody,
      body_format: 'html',
    });

    const decoded = Buffer.from(message.raw, 'base64url').toString('utf8');
    expect(decoded).toContain('multipart/alternative');
    expect(decoded).toContain(htmlBody);
  });
});
