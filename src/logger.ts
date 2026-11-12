/**
 * JSON Logger targeting stderr.
 * Enforces field allowlisting to prevent credential, token, or content leakage.
 * All stdout is strictly reserved for MCP JSON-RPC protocol frames.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// Allowlisted fields according to Architecture §11
const ALLOWED_FIELDS = new Set([
  'ts',
  'level',
  'tool',
  'status',
  'error_code',
  'duration_ms',
  'recipient_count',
  'doc_id',
  'chars',
  'dry_run',
  'message_id',
  'msg',
]);

export interface LogEntry {
  tool?: string;
  status?: string;
  error_code?: string;
  duration_ms?: number;
  recipient_count?: number;
  doc_id?: string;
  chars?: number;
  dry_run?: boolean;
  message_id?: string;
  msg?: string;
  [key: string]: unknown;
}

export class Logger {
  private minLevelNumber: number;

  constructor(private level: LogLevel = 'info') {
    this.minLevelNumber = LOG_LEVELS[level] ?? LOG_LEVELS.info;
  }

  public setLevel(level: LogLevel) {
    this.level = level;
    this.minLevelNumber = LOG_LEVELS[level] ?? LOG_LEVELS.info;
  }

  private log(level: LogLevel, entry: LogEntry | string) {
    if (LOG_LEVELS[level] < this.minLevelNumber) {
      return;
    }

    const baseEntry: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
    };

    if (typeof entry === 'string') {
      baseEntry.msg = entry;
    } else {
      for (const [key, val] of Object.entries(entry)) {
        if (ALLOWED_FIELDS.has(key) && val !== undefined) {
          baseEntry[key] = val;
        }
      }
    }

    try {
      process.stderr.write(JSON.stringify(baseEntry) + '\n');
    } catch {
      // Ignore stderr write failures
    }
  }

  debug(entry: LogEntry | string) {
    this.log('debug', entry);
  }

  info(entry: LogEntry | string) {
    this.log('info', entry);
  }

  warn(entry: LogEntry | string) {
    this.log('warn', entry);
  }

  error(entry: LogEntry | string) {
    this.log('error', entry);
  }
}

export const logger = new Logger('info');
