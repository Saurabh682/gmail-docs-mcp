import type { LedgerInterface } from '../state/Ledger.js';

export interface RateLimiterConfig {
  maxSendsPerMinute: number;
  maxSendsPerDay: number;
  maxAppendPerMinute: number;
}

export class RateLimiter {
  constructor(
    private readonly ledger: LedgerInterface,
    private readonly config: RateLimiterConfig
  ) {}

  async checkSendLimit(): Promise<void> {
    await this.ledger.checkSendLimit(this.config.maxSendsPerMinute, this.config.maxSendsPerDay);
  }

  async recordSend(): Promise<void> {
    await this.ledger.recordSend();
  }

  async checkAppendLimit(): Promise<void> {
    await this.ledger.checkAppendLimit(this.config.maxAppendPerMinute);
  }

  async recordAppend(): Promise<void> {
    await this.ledger.recordAppend();
  }
}
