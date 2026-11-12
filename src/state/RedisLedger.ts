import { Redis } from '@upstash/redis';
import { DomainError } from '../errors.js';
import type { Config } from '../config/config.js';
import type { LedgerInterface } from './Ledger.js';

export class RedisLedger implements LedgerInterface {
  private redis: Redis;

  constructor(config: Config) {
    if (!config.upstashRedisRestUrl || !config.upstashRedisRestToken) {
      throw new Error('RedisLedger requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
    }
    this.redis = new Redis({
      url: config.upstashRedisRestUrl,
      token: config.upstashRedisRestToken,
    });
  }

  async checkSendLimit(maxPerMinute: number, maxPerDay: number): Promise<void> {
    try {
      const now = Date.now();
      const oneMinuteAgo = now - 60 * 1000;
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      const key = 'gdm:ratelimit:send';

      // Prune records older than 1 day
      await this.redis.zremrangebyscore(key, 0, oneDayAgo);

      // Check sends in last minute
      const sendsLastMinute = await this.redis.zcount(key, oneMinuteAgo, now);
      if (sendsLastMinute >= maxPerMinute) {
        throw new DomainError(
          'RATE_LIMITED_LOCAL',
          `Send rate limit exceeded: maximum ${maxPerMinute} emails per minute allowed.`,
          true,
          'Wait a minute before sending another email.'
        );
      }

      // Check sends in last day
      const sendsLastDay = await this.redis.zcount(key, oneDayAgo, now);
      if (sendsLastDay >= maxPerDay) {
        throw new DomainError(
          'RATE_LIMITED_LOCAL',
          `Daily send rate limit exceeded: maximum ${maxPerDay} emails per day allowed.`,
          false,
          'Daily email sending quota exhausted.'
        );
      }
    } catch (err) {
      if (err instanceof DomainError) throw err;
      throw new DomainError(
        'STATE_UNAVAILABLE',
        `Failed to verify rate limits with Redis ledger: ${err instanceof Error ? err.message : String(err)}`,
        false
      );
    }
  }

  async recordSend(): Promise<void> {
    try {
      const now = Date.now();
      const key = 'gdm:ratelimit:send';
      await this.redis.zadd(key, { score: now, member: `${now}-${Math.random().toString(36).slice(2)}` });
      // 25 hour expiration on the key
      await this.redis.expire(key, 25 * 3600);
    } catch (err) {
      throw new DomainError(
        'STATE_UNAVAILABLE',
        'Failed to record send action in Redis ledger.',
        false
      );
    }
  }

  async checkAppendLimit(maxPerMinute: number): Promise<void> {
    try {
      const now = Date.now();
      const oneMinuteAgo = now - 60 * 1000;
      const key = 'gdm:ratelimit:append';

      await this.redis.zremrangebyscore(key, 0, oneMinuteAgo);
      const appendsLastMinute = await this.redis.zcount(key, oneMinuteAgo, now);

      if (appendsLastMinute >= maxPerMinute) {
        throw new DomainError(
          'RATE_LIMITED_LOCAL',
          `Append rate limit exceeded: maximum ${maxPerMinute} document appends per minute allowed.`,
          true,
          'Wait a minute before appending again.'
        );
      }
    } catch (err) {
      if (err instanceof DomainError) throw err;
      throw new DomainError(
        'STATE_UNAVAILABLE',
        `Failed to verify append limits with Redis ledger: ${err instanceof Error ? err.message : String(err)}`,
        false
      );
    }
  }

  async recordAppend(): Promise<void> {
    try {
      const now = Date.now();
      const key = 'gdm:ratelimit:append';
      await this.redis.zadd(key, { score: now, member: `${now}-${Math.random().toString(36).slice(2)}` });
      await this.redis.expire(key, 3600);
    } catch (err) {
      throw new DomainError(
        'STATE_UNAVAILABLE',
        'Failed to record append action in Redis ledger.',
        false
      );
    }
  }
}
