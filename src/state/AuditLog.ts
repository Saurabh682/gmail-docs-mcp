import fs from 'node:fs';
import path from 'node:path';

export type AuditOutcome = 'sent' | 'appended' | 'validated_not_sent' | 'rejected' | 'unknown';

export interface AuditEntry {
  tool: 'send_email' | 'append_to_doc';
  status: string;
  outcome: AuditOutcome;
  duration_ms?: number;
  recipient_count?: number;
  doc_id?: string;
  chars?: number;
  dry_run?: boolean;
  message_id?: string;
  error_code?: string;
}

export class AuditLog {
  private readonly filePath: string;
  private readonly isServerless: boolean;

  constructor(stateDir: string, isServerless = false) {
    this.filePath = path.join(stateDir, 'audit.jsonl');
    this.isServerless = isServerless;
  }

  async record(entry: AuditEntry): Promise<void> {
    const record = {
      type: 'audit',
      ts: new Date().toISOString(),
      tool: entry.tool,
      status: entry.status,
      outcome: entry.outcome,
      duration_ms: entry.duration_ms,
      recipient_count: entry.recipient_count,
      doc_id: entry.doc_id,
      chars: entry.chars,
      dry_run: entry.dry_run,
      message_id: entry.message_id,
      error_code: entry.error_code,
    };

    if (this.isServerless) {
      // In serverless, stream audit record directly to stderr for cloud log drains
      process.stderr.write(JSON.stringify(record) + '\n');
      return;
    }

    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }

      await fs.promises.appendFile(this.filePath, JSON.stringify(record) + '\n', 'utf8');
    } catch {
      // Fallback to stderr if filesystem write fails (e.g. read-only container)
      try {
        process.stderr.write(JSON.stringify(record) + '\n');
      } catch {
        // Silently handle
      }
    }
  }
}
