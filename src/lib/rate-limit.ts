/**
 * Simple in-memory rate limiter for API endpoints
 * Note: For production use, replace with Redis-based solution (e.g., @upstash/ratelimit)
 */

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const store: RateLimitStore = {};

interface RateLimitOptions {
  maxRequests: number;      // Maximum requests allowed
  windowMs: number;         // Time window in milliseconds
}

const defaultOptions: RateLimitOptions = {
  maxRequests: 10,
  windowMs: 10000,          // 10 seconds
};

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

/**
 * Check if request is within rate limit
 */
export function rateLimit(
  identifier: string,
  options: Partial<RateLimitOptions> = {}
): RateLimitResult {
  const { maxRequests, windowMs } = { ...defaultOptions, ...options };
  const now = Date.now();

  const record = store[identifier];

  if (!record || now > record.resetTime) {
    // Create new record or reset expired one
    store[identifier] = {
      count: 1,
      resetTime: now + windowMs,
    };
    return {
      success: true,
      remaining: maxRequests - 1,
      resetTime: store[identifier].resetTime,
    };
  }

  if (record.count >= maxRequests) {
    // Rate limit exceeded
    return {
      success: false,
      remaining: 0,
      resetTime: record.resetTime,
      retryAfter: Math.ceil((record.resetTime - now) / 1000),
    };
  }

  // Increment counter
  record.count++;
  return {
    success: true,
    remaining: maxRequests - record.count,
    resetTime: record.resetTime,
  };
}

/**
 * Clean up expired entries (call periodically in production)
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key];
    }
  }
}

// Auto-cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimitStore, 5 * 60 * 1000);
}
