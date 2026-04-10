import type { IncomingHttpHeaders } from 'http';
import Redis from 'ioredis';

export interface RateLimitPolicy {
  name: string;
  max: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  check(key: string, policy: RateLimitPolicy): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = {
        count: 0,
        resetAt: now + policy.windowMs,
      };
      this.buckets.set(key, bucket);
    }

    bucket.count += 1;

    const allowed = bucket.count <= policy.max;
    const remaining = Math.max(0, policy.max - bucket.count);
    const retryAfterMs = Math.max(0, bucket.resetAt - now);

    return {
      allowed,
      limit: policy.max,
      remaining,
      resetAt: bucket.resetAt,
      retryAfterMs,
    };
  }

  cleanup(now = Date.now()): number {
    let removed = 0;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  size(): number {
    return this.buckets.size;
  }
}

const redisUrl = process.env.REDIS_URL?.trim();
const redis = redisUrl
  ? new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
  : null;

let redisConnectAttempted = false;

async function ensureRedisConnection(): Promise<boolean> {
  if (!redis) return false;
  if (redis.status === 'ready') return true;
  if (redisConnectAttempted) return false;

  redisConnectAttempted = true;
  try {
    await redis.connect();
    return true;
  } catch {
    return false;
  }
}

export const HTTP_POLICIES = {
  read: { name: 'http_read', max: 600, windowMs: 60_000 },
  write: { name: 'http_write', max: 180, windowMs: 60_000 },
  auth: { name: 'http_auth', max: 20, windowMs: 15 * 60_000 },
  search: { name: 'http_search', max: 120, windowMs: 60_000 },
} satisfies Record<string, RateLimitPolicy>;

export const WS_POLICIES = {
  auth: { name: 'ws_auth', max: 12, windowMs: 60_000 },
  message: { name: 'ws_message', max: 240, windowMs: 60_000 },
} satisfies Record<string, RateLimitPolicy>;

const rateLimiter = new FixedWindowRateLimiter();

const AUTH_PATHS = new Set([
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/verify',
  '/api/auth/resend-otp',
]);

async function checkWithRedis(identity: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / policy.windowMs) * policy.windowMs;
  const resetAt = windowStart + policy.windowMs;
  const redisKey = `ratelimit:${policy.name}:${identity}:${windowStart}`;

  const value = await redis!.incr(redisKey);
  if (value === 1) {
    await redis!.pexpire(redisKey, policy.windowMs);
  }

  const allowed = value <= policy.max;
  const remaining = Math.max(0, policy.max - value);
  const retryAfterMs = Math.max(0, resetAt - now);

  return {
    allowed,
    limit: policy.max,
    remaining,
    resetAt,
    retryAfterMs,
  };
}

export function resolveHttpPolicy(path: string, method: string): RateLimitPolicy | null {
  if (path === '/health') return null;

  if (AUTH_PATHS.has(path)) {
    return HTTP_POLICIES.auth;
  }

  if (path.includes('/search')) {
    return HTTP_POLICIES.search;
  }

  if (method === 'GET') {
    return HTTP_POLICIES.read;
  }

  return HTTP_POLICIES.write;
}

export async function checkHttpRateLimit(clientIp: string, path: string, method: string): Promise<RateLimitResult | null> {
  const policy = resolveHttpPolicy(path, method);
  if (!policy) return null;

  if (await ensureRedisConnection()) {
    try {
      return await checkWithRedis(`http:${clientIp}`, policy);
    } catch {
      // Fallback to in-memory limiter if Redis is unavailable.
    }
  }

  return rateLimiter.check(`http:${policy.name}:${clientIp}`, policy);
}

export async function checkWsAuthRateLimit(clientIp: string): Promise<RateLimitResult> {
  if (await ensureRedisConnection()) {
    try {
      return await checkWithRedis(`ws-auth:${clientIp}`, WS_POLICIES.auth);
    } catch {
      // Fallback to in-memory limiter if Redis is unavailable.
    }
  }
  return rateLimiter.check(`ws:${WS_POLICIES.auth.name}:${clientIp}`, WS_POLICIES.auth);
}

export async function checkWsMessageRateLimit(accountId: string): Promise<RateLimitResult> {
  if (await ensureRedisConnection()) {
    try {
      return await checkWithRedis(`ws-msg:${accountId}`, WS_POLICIES.message);
    } catch {
      // Fallback to in-memory limiter if Redis is unavailable.
    }
  }
  return rateLimiter.check(`ws:${WS_POLICIES.message.name}:${accountId}`, WS_POLICIES.message);
}

export function cleanupRateLimitBuckets(now = Date.now()): number {
  return rateLimiter.cleanup(now);
}

export function getRateLimitStats(): { buckets: number; backend: 'redis' | 'memory' } {
  if (redis && redis.status === 'ready') {
    return { buckets: 0, backend: 'redis' };
  }
  return { buckets: rateLimiter.size(), backend: 'memory' };
}

export function extractClientIp(headers: IncomingHttpHeaders): string {
  const forwarded = headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(',')[0].trim();
  }

  const realIp = headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.length > 0) return realIp.trim();
  if (Array.isArray(realIp) && realIp.length > 0) return realIp[0].trim();

  return 'unknown';
}
