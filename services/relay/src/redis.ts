/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * Redis/Valkey connection
 *
 * Используется для:
 * - Presence tracking (online/offline)
 * - Offline message queue
 * - Rate limiting
 * - BullMQ job queue
 * - Pub/sub между relay instances
 */

import { Redis as RedisClient } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export function createRedisConnection(): RedisClient {
  const redis = new RedisClient(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    connectionName: 'presidium-relay',
  });

  redis.on('connect', () => {
    console.log('[Redis] Connected to', redisUrl.replace(/\/\/.*@/, '//***@'));
  });

  redis.on('error', (err: Error) => {
    console.error('[Redis] Connection error:', err.message);
  });

  redis.on('reconnecting', () => {
    console.log('[Redis] Reconnecting...');
  });

  return redis;
}

export const redis = createRedisConnection();

export function createPubSub(): { publisher: RedisClient; subscriber: RedisClient } {
  return {
    publisher: createRedisConnection(),
    subscriber: createRedisConnection(),
  };
}

process.on('SIGTERM', async () => {
  console.log('[Redis] Disconnecting...');
  await redis.quit();
});

process.on('SIGINT', async () => {
  console.log('[Redis] Disconnecting...');
  await redis.quit();
});
