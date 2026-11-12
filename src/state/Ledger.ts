import fs from 'node:fs';
import path from 'node:path';
import { DomainError } from '../errors.js';
import type { Config } from '../config/config.js';

export interface LedgerInterface {
  checkSendLimit(maxPerMinute: number, maxPerDay: number): void | Promise<void>;
  recordSend(): Promise<void>;
  checkAppendLimit(maxPerMinute: number): void | Promise<void>;
  recordAppend(): Promise<void>;
}

export interface LedgerData {
  sendTimestamps: number[];
  appendTimestamps: number[];
}

export class Ledger implements LedgerInterface {
  private readonly filePath: string;

  constructor(stateDir: string) {
    this.filePath = path.join(stateDir, 'ledger.json');
  }

  private readData(): LedgerData {
    try {
      if (!fs.existsSync(this.filePath)) {
        return { sendTimestamps: [], appendTimestamps: [] };
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      const now = Date.now();
      const oneDayAgo = now - 24 * 60 * 60 * 1000;

      return {
        sendTimestamps: Array.isArray(data.sendTimestamps)
          ? data.sendTimestamps.filter((t: number) => typeof t === 'number' && t > oneDayAgo)
          : [],
        appendTimestamps: Array.isArray(data.appendTimestamps)
          ? data.appendTimestamps.filter((t: number) => typeof t === 'number' && t > oneDayAgo)
          : [],
      };
    } catch {
      throw new DomainError(
        'STATE_UNAVAILABLE',
        'Could not access or read rate limit ledger. Failing closed.',
        false
      );
    }
  }

  private writeData(data: LedgerData): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.filePath);
    } catch {
      throw new DomainError(
        'STATE_UNAVAILABLE',
        'Could not write rate limit ledger. Failing closed.',
        false
      );
    }
  }

  checkSendLimit(maxPerMinute: number, maxPerDay: number): void {
    const data = this.readData();
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const sendsLastMinute = data.sendTimestamps.filter((t) => t > oneMinuteAgo).length;
    if (sendsLastMinute >= maxPerMinute) {
      throw new DomainError(
        'RATE_LIMITED_LOCAL',
        `Send rate limit exceeded: maximum ${maxPerMinute} emails per minute allowed.`,
        true,
        'Wait a minute before sending another email.'
      );
    }

    const sendsLastDay = data.sendTimestamps.filter((t) => t > oneDayAgo).length;
    if (sendsLastDay >= maxPerDay) {
      throw new DomainError(
        'RATE_LIMITED_LOCAL',
        `Daily send rate limit exceeded: maximum ${maxPerDay} emails per day allowed.`,
        false,
        'Daily email sending quota exhausted.'
      );
    }
  }

  async recordSend(): Promise<void> {
    const data = this.readData();
    data.sendTimestamps.push(Date.now());
    this.writeData(data);
  }

  checkAppendLimit(maxPerMinute: number): void {
    const data = this.readData();
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    const appendsLastMinute = data.appendTimestamps.filter((t) => t > oneMinuteAgo).length;
    if (appendsLastMinute >= maxPerMinute) {
      throw new DomainError(
        'RATE_LIMITED_LOCAL',
        `Append rate limit exceeded: maximum ${maxPerMinute} document appends per minute allowed.`,
        true,
        'Wait a minute before appending again.'
      );
    }
  }

  async recordAppend(): Promise<void> {
    const data = this.readData();
    data.appendTimestamps.push(Date.now());
    this.writeData(data);
  }
}

/**
 * In-memory fallback ledger for ephemeral serverless testing
 */
export class MemoryLedger implements LedgerInterface {
  private sendTimestamps: number[] = [];
  private appendTimestamps: number[] = [];

  checkSendLimit(maxPerMinute: number, maxPerDay: number): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    const sendsLastMinute = this.sendTimestamps.filter((t) => t > oneMinuteAgo).length;
    if (sendsLastMinute >= maxPerMinute) {
      throw new DomainError(
        'RATE_LIMITED_LOCAL',
        `Send rate limit exceeded: maximum ${maxPerMinute} emails per minute allowed.`,
        true
      );
    }

    const sendsLastDay = this.sendTimestamps.filter((t) => t > oneDayAgo).length;
    if (sendsLastDay >= maxPerDay) {
      throw new DomainError(
        'RATE_LIMITED_LOCAL',
        `Daily send rate limit exceeded: maximum ${maxPerDay} emails per day allowed.`,
        false
      );
    }
  }

  async recordSend(): Promise<void> {
    this.sendTimestamps.push(Date.now());
  }

  checkAppendLimit(maxPerMinute: number): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    const appendsLastMinute = this.appendTimestamps.filter((t) => t > oneMinuteAgo).length;
    if (appendsLastMinute >= maxPerMinute) {
      throw new DomainError(
        'RATE_LIMITED_LOCAL',
        `Append rate limit exceeded: maximum ${maxPerMinute} document appends per minute allowed.`,
        true
      );
    }
  }

  async recordAppend(): Promise<void> {
    this.appendTimestamps.push(Date.now());
  }
}

/**
 * Factory creating the proper Ledger based on available infrastructure:
 * - RedisLedger if Upstash is configured
 * - MemoryLedger if in serverless environment without Redis
 * - Ledger (File-backed) for local stdio
 */
export async function createLedger(config: Config): Promise<LedgerInterface> {
  if (config.upstashRedisRestUrl && config.upstashRedisRestToken) {
    const { RedisLedger } = await import('./RedisLedger.js');
    return new RedisLedger(config);
  }

  if (config.isServerless) {
    return new MemoryLedger();
  }

  return new Ledger(config.stateDir);
}
