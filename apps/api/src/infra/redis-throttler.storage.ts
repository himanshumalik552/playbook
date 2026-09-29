import { Inject, Injectable } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Logger } from '@adpulse/core';
import type { Redis } from 'ioredis';
import { LOGGER, REDIS } from './tokens';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/** Atomic fixed-window counter; sets a block key once the limit is exceeded. */
const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) and tonumber(ARGV[3]) > 0 and redis.call('EXISTS', KEYS[2]) == 0 then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
end
local blockTtl = redis.call('PTTL', KEYS[2])
return { hits, ttl, blockTtl }
`;

/**
 * Shares rate-limit counters across API replicas. If Redis is unavailable the request is allowed, because
 * brute-force protection for credentials is also enforced in the database (account lockout).
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `adpulse:throttle:${throttlerName}:${key}`;
    try {
      const [hits, ttlMs, blockMs] = (await this.redis.eval(
        INCREMENT_SCRIPT,
        2,
        base,
        `${base}:blocked`,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number];
      const isBlocked = blockMs > 0;
      return {
        totalHits: hits,
        timeToExpire: Math.max(0, Math.ceil(ttlMs / 1000)),
        isBlocked,
        timeToBlockExpire: isBlocked ? Math.ceil(blockMs / 1000) : 0,
      };
    } catch (error) {
      this.logger.warn(
        { err: error instanceof Error ? error.message : String(error) },
        'Rate-limit storage unavailable; allowing request',
      );
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
