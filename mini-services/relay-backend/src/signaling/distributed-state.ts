import Redis, { type Cluster } from 'ioredis';
import type { RelayEnvelope } from '../types';

type RedisClient = Redis | Cluster;

const KEYSPACE = '{relay}';
const SESSION_KEY = (accountId: string) => `${KEYSPACE}:session:${accountId}`;
const SESSIONS_INDEX_KEY = `${KEYSPACE}:sessions:index`;
const QUEUE_LIST_KEY = (accountId: string) => `${KEYSPACE}:queue:list:${accountId}`;
const QUEUE_RECIPIENTS_KEY = `${KEYSPACE}:queue:recipients`;
const QUEUE_TOTAL_KEY = `${KEYSPACE}:queue:total`;

const SESSION_TTL_MS = Number(process.env.RELAY_SESSION_TTL_MS || 120_000);

const REDIS_URL = process.env.REDIS_URL?.trim();
const REDIS_CLUSTER_NODES = process.env.REDIS_CLUSTER_NODES?.trim();

let redisClient: RedisClient | null = null;
let redisInitAttempted = false;

function parseClusterNodes(raw: string): Array<{ host: string; port: number }> {
  return raw
    .split(',')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const [host, portRaw] = segment.split(':');
      const port = Number(portRaw || '6379');
      return { host, port: Number.isFinite(port) ? port : 6379 };
    });
}

function buildRedisClient(): RedisClient | null {
  if (REDIS_CLUSTER_NODES) {
    const nodes = parseClusterNodes(REDIS_CLUSTER_NODES);
    if (nodes.length > 0) {
      return new Redis.Cluster(nodes, {
        redisOptions: {
          lazyConnect: true,
          maxRetriesPerRequest: 1,
        },
      });
    }
  }

  if (REDIS_URL) {
    return new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }

  return null;
}

async function getRedis(): Promise<RedisClient | null> {
  if (!REDIS_URL && !REDIS_CLUSTER_NODES) return null;

  if (!redisClient) {
    redisClient = buildRedisClient();
  }
  if (!redisClient) return null;

  const status = String((redisClient as { status?: string }).status || '');
  if (status === 'ready' || status === 'connect') return redisClient;
  if (redisInitAttempted) return null;

  redisInitAttempted = true;
  try {
    await redisClient.connect();
    return redisClient;
  } catch {
    return null;
  }
}

export interface SessionPresencePayload {
  accountId: string;
  nodeId: string;
  connectedAt: number;
  lastPing: number;
}

export async function upsertSessionPresence(payload: SessionPresencePayload): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;

  const raw = JSON.stringify(payload);
  await redis.set(SESSION_KEY(payload.accountId), raw, 'PX', SESSION_TTL_MS);
  await redis.sadd(SESSIONS_INDEX_KEY, payload.accountId);
  return true;
}

export async function touchSessionPresence(accountId: string, lastPing: number): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;

  const key = SESSION_KEY(accountId);
  const raw = await redis.get(key);
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw) as SessionPresencePayload;
    const next: SessionPresencePayload = {
      ...parsed,
      accountId,
      lastPing,
    };
    await redis.set(key, JSON.stringify(next), 'PX', SESSION_TTL_MS);
    await redis.sadd(SESSIONS_INDEX_KEY, accountId);
    return true;
  } catch {
    await redis.del(key);
    await redis.srem(SESSIONS_INDEX_KEY, accountId);
    return false;
  }
}

export async function removeSessionPresence(accountId: string): Promise<boolean> {
  const redis = await getRedis();
  if (!redis) return false;

  await redis.del(SESSION_KEY(accountId));
  await redis.srem(SESSIONS_INDEX_KEY, accountId);
  return true;
}

export async function isSessionOnline(accountId: string): Promise<boolean | null> {
  const redis = await getRedis();
  if (!redis) return null;
  const exists = await redis.exists(SESSION_KEY(accountId));
  if (exists) {
    await redis.sadd(SESSIONS_INDEX_KEY, accountId);
  } else {
    await redis.srem(SESSIONS_INDEX_KEY, accountId);
  }
  return exists === 1;
}

export async function cleanupSessionPresenceIndex(): Promise<number> {
  const redis = await getRedis();
  if (!redis) return 0;

  const members = await redis.smembers(SESSIONS_INDEX_KEY);
  if (members.length === 0) return 0;

  let removed = 0;
  for (const accountId of members) {
    const exists = await redis.exists(SESSION_KEY(accountId));
    if (exists === 0) {
      await redis.srem(SESSIONS_INDEX_KEY, accountId);
      removed += 1;
    }
  }

  return removed;
}

export interface QueueLimits {
  perRecipientLimit: number;
  totalLimit: number;
  ttlMs: number;
}

export interface RedisEnqueueResult {
  supported: boolean;
  ok: boolean;
  queueSize: number;
  queuedMessageId?: string;
  error?: string;
}

interface RedisQueuedEnvelope {
  id: string;
  envelope: RelayEnvelope;
  queuedAt: number;
  expiresAt: number;
  deliveryAttempts: number;
}

function parseQueued(raw: string): RedisQueuedEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as RedisQueuedEnvelope;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.id || !parsed.envelope || typeof parsed.queuedAt !== 'number' || typeof parsed.expiresAt !== 'number') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function enqueueOfflineEnvelopeRedis(
  envelope: RelayEnvelope,
  limits: QueueLimits,
): Promise<RedisEnqueueResult> {
  const redis = await getRedis();
  if (!redis) {
    return { supported: false, ok: false, queueSize: 0 };
  }

  const queueKey = QUEUE_LIST_KEY(envelope.to);
  const queueSize = await redis.llen(queueKey);
  if (queueSize >= limits.perRecipientLimit) {
    return {
      supported: true,
      ok: false,
      queueSize,
      error: 'Recipient offline queue is full',
    };
  }

  const total = Number((await redis.get(QUEUE_TOTAL_KEY)) || '0');
  if (total >= limits.totalLimit) {
    return {
      supported: true,
      ok: false,
      queueSize,
      error: 'Global offline queue is full',
    };
  }

  const now = Date.now();
  const queued: RedisQueuedEnvelope = {
    id: crypto.randomUUID(),
    envelope,
    queuedAt: now,
    expiresAt: now + limits.ttlMs,
    deliveryAttempts: 0,
  };

  await redis.rpush(queueKey, JSON.stringify(queued));
  await redis.sadd(QUEUE_RECIPIENTS_KEY, envelope.to);
  await redis.incr(QUEUE_TOTAL_KEY);

  return {
    supported: true,
    ok: true,
    queueSize: queueSize + 1,
    queuedMessageId: queued.id,
  };
}

export interface QueueDeliveryStats {
  supported: boolean;
  delivered: number;
  dropped: number;
  remaining: number;
}

export async function deliverQueuedRedis(
  accountId: string,
  send: (item: RedisQueuedEnvelope) => Promise<boolean> | boolean,
  blocked: (from: string, to: string) => Promise<boolean>,
): Promise<QueueDeliveryStats> {
  const redis = await getRedis();
  if (!redis) {
    return { supported: false, delivered: 0, dropped: 0, remaining: 0 };
  }

  const queueKey = QUEUE_LIST_KEY(accountId);
  const rawEntries = await redis.lrange(queueKey, 0, -1);
  if (rawEntries.length === 0) {
    return { supported: true, delivered: 0, dropped: 0, remaining: 0 };
  }

  const now = Date.now();
  const pending: string[] = [];
  let delivered = 0;
  let dropped = 0;

  for (const raw of rawEntries) {
    const queued = parseQueued(raw);
    if (!queued) {
      dropped += 1;
      continue;
    }

    if (queued.expiresAt <= now) {
      dropped += 1;
      continue;
    }

    if (await blocked(queued.envelope.from, queued.envelope.to)) {
      dropped += 1;
      continue;
    }

    const sent = await send(queued);
    if (sent) {
      delivered += 1;
      continue;
    }

    pending.push(
      JSON.stringify({
        ...queued,
        deliveryAttempts: queued.deliveryAttempts + 1,
      } satisfies RedisQueuedEnvelope),
    );
  }

  await redis.del(queueKey);
  if (pending.length > 0) {
    await redis.rpush(queueKey, ...pending);
    await redis.sadd(QUEUE_RECIPIENTS_KEY, accountId);
  } else {
    await redis.srem(QUEUE_RECIPIENTS_KEY, accountId);
  }

  const removed = delivered + dropped;
  if (removed > 0) {
    await redis.decrby(QUEUE_TOTAL_KEY, removed);
    const total = Number((await redis.get(QUEUE_TOTAL_KEY)) || '0');
    if (total < 0) {
      await redis.set(QUEUE_TOTAL_KEY, '0');
    }
  }

  return {
    supported: true,
    delivered,
    dropped,
    remaining: pending.length,
  };
}

export async function cleanupExpiredQueuedRedis(now = Date.now()): Promise<{ supported: boolean; removed: number }> {
  const redis = await getRedis();
  if (!redis) {
    return { supported: false, removed: 0 };
  }

  const recipients = await redis.smembers(QUEUE_RECIPIENTS_KEY);
  if (recipients.length === 0) {
    return { supported: true, removed: 0 };
  }

  let removed = 0;

  for (const accountId of recipients) {
    const queueKey = QUEUE_LIST_KEY(accountId);
    const entries = await redis.lrange(queueKey, 0, -1);
    if (entries.length === 0) {
      await redis.srem(QUEUE_RECIPIENTS_KEY, accountId);
      continue;
    }

    const pending: string[] = [];
    for (const raw of entries) {
      const queued = parseQueued(raw);
      if (!queued || queued.expiresAt <= now) {
        removed += 1;
        continue;
      }
      pending.push(raw);
    }

    await redis.del(queueKey);
    if (pending.length > 0) {
      await redis.rpush(queueKey, ...pending);
      await redis.sadd(QUEUE_RECIPIENTS_KEY, accountId);
    } else {
      await redis.srem(QUEUE_RECIPIENTS_KEY, accountId);
    }
  }

  if (removed > 0) {
    await redis.decrby(QUEUE_TOTAL_KEY, removed);
    const total = Number((await redis.get(QUEUE_TOTAL_KEY)) || '0');
    if (total < 0) {
      await redis.set(QUEUE_TOTAL_KEY, '0');
    }
  }

  return { supported: true, removed };
}

export async function getOfflineQueueStatsRedis(): Promise<{
  supported: boolean;
  recipients: number;
  total: number;
}> {
  const redis = await getRedis();
  if (!redis) {
    return { supported: false, recipients: 0, total: 0 };
  }

  const recipients = await redis.scard(QUEUE_RECIPIENTS_KEY);
  const total = Number((await redis.get(QUEUE_TOTAL_KEY)) || '0');

  return {
    supported: true,
    recipients,
    total: total < 0 ? 0 : total,
  };
}
