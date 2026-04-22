/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * Rate Limiting Middleware
 *
 * Sliding window limiter using Redis ZSET.
 * Exposes modern presets + compatibility helper for old scoped usage.
 */

import { createMiddleware } from 'hono/factory';

import { redis } from '../redis.js';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

const DEFAULT_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 100,
  keyPrefix: 'ratelimit:api',
};

const AUTH_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 5,
  keyPrefix: 'ratelimit:auth',
};

const MESSAGE_LIMIT: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: 120,
  keyPrefix: 'ratelimit:msg',
};

function normalizeClientId(raw: string | undefined): string {
  if (!raw) {
    return 'unknown';
  }
  return raw.split(',')[0]?.trim() || 'unknown';
}

function resolveClientId(c: unknown): string {
  const ctx = c as {
    get: (key: string) => unknown;
    req: { header: (name: string) => string | undefined };
  };

  const auth = ctx.get('auth') as { userId?: string } | undefined;
  if (auth?.userId) {
    return auth.userId;
  }

  const user = ctx.get('user') as { id?: string } | undefined;
  if (user?.id) {
    return user.id;
  }

  const forwarded = normalizeClientId(
    ctx.req.header('x-forwarded-for') ||
      ctx.req.header('X-Forwarded-For') ||
      ctx.req.header('x-real-ip') ||
      ctx.req.header('X-Real-IP')
  );

  return forwarded;
}

function createRateLimitMiddleware(config: RateLimitConfig) {
  return createMiddleware(async (c, next) => {
    const clientId = resolveClientId(c);
    const key = `${config.keyPrefix}:${clientId}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const requestId = `${now}:${Math.random().toString(36).slice(2)}`;

    try {
      await redis.zremrangebyscore(key, 0, windowStart);
      const currentCount = await redis.zcard(key);

      if (currentCount >= config.maxRequests) {
        const ttlMs = Math.max(await redis.pttl(key), 0);
        c.header('X-RateLimit-Limit', String(config.maxRequests));
        c.header('X-RateLimit-Remaining', '0');
        c.header('X-RateLimit-Reset', new Date(now + ttlMs).toISOString());
        c.header('Retry-After', String(Math.ceil(ttlMs / 1000)));

        return c.json(
          {
            success: false,
            error: 'Rate limit exceeded',
            code: 'RATE_LIMITED',
            retryAfter: Math.ceil(ttlMs / 1000),
          },
          429
        );
      }

      await redis.zadd(key, now, requestId);
      await redis.pexpire(key, config.windowMs);

      const remaining = Math.max(0, config.maxRequests - currentCount - 1);
      c.header('X-RateLimit-Limit', String(config.maxRequests));
      c.header('X-RateLimit-Remaining', String(remaining));
      c.header('X-RateLimit-Reset', new Date(now + config.windowMs).toISOString());
    } catch (err) {
      // Fail-open to keep API availability.
      console.error('[RateLimit] Redis error:', err);
    }

    await next();
  });
}

export const apiRateLimit = createRateLimitMiddleware(DEFAULT_LIMIT);
export const authRateLimit = createRateLimitMiddleware(AUTH_LIMIT);
export const messageRateLimit = createRateLimitMiddleware(MESSAGE_LIMIT);

/**
 * Backward-compatible scoped limiter.
 * Existing code can still call: rateLimit('scope', 10, 60)
 */
export function rateLimit(scope: string, limit: number, windowSeconds: number) {
  return createRateLimitMiddleware({
    windowMs: windowSeconds * 1000,
    maxRequests: limit,
    keyPrefix: `ratelimit:${scope}`,
  });
}
