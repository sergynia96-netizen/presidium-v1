/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * Presence Update Handler — Production Version
 *
 * Управляет статусом пользователя:
 * - online: активен, получает сообщения realtime
 * - away: неактивен N минут (auto)
 * - dnd: не беспокоить
 * - offline: нет активных соединений
 *
 * Broadcast to contacts via Redis pub/sub.
 */

import type { Redis } from 'ioredis';
import { eq } from 'drizzle-orm';

import type { ExtendedWebSocket } from '../ws/handler.js';
import { db } from '../db/index.js';
import { contacts } from '../db/schema.js';

const AUTO_AWAY_MS = 300_000;

export async function handlePresenceUpdate(
  payload: {
    status: 'online' | 'away' | 'dnd' | 'offline';
    customStatus?: string;
    lastActivity?: number;
  },
  ws: ExtendedWebSocket,
  redis: Redis
): Promise<void> {
  if (!ws.userId) {
    return;
  }

  const userId = ws.userId;
  const status = payload.status;
  const now = Date.now();

  const validStatuses = ['online', 'away', 'dnd', 'offline'];
  if (!validStatuses.includes(status)) {
    ws.send(
      JSON.stringify({
        type: 'presence.error',
        payload: {
          error: 'Invalid status',
          validStatuses,
          code: 'INVALID_STATUS',
        },
        timestamp: now,
      }),
      false
    );
    return;
  }

  const presenceData = {
    status,
    customStatus: payload.customStatus || '',
    lastSeen: now,
    lastActivity: payload.lastActivity || now,
    deviceId: ws.deviceId || 'unknown',
  };

  try {
    await redis.hset(`presence:${userId}`, presenceData);
    await redis.expire(`presence:${userId}`, 3600);
  } catch (err) {
    console.error('[Presence] Redis error:', err);
    ws.send(
      JSON.stringify({
        type: 'presence.error',
        payload: { error: 'Failed to update presence', code: 'REDIS_ERROR' },
        timestamp: now,
      }),
      false
    );
    return;
  }

  try {
    await broadcastPresenceUpdate(userId, status, presenceData, redis);
  } catch (err) {
    console.warn('[Presence] Broadcast error:', err);
  }

  ws.send(
    JSON.stringify({
      type: 'presence.ack',
      payload: {
        status,
        serverTime: now,
        autoAwayMs: AUTO_AWAY_MS,
      },
      timestamp: now,
    }),
    false
  );
}

async function broadcastPresenceUpdate(
  userId: string,
  status: string,
  presenceData: Record<string, string | number>,
  redis: Redis
): Promise<void> {
  let contactList;
  try {
    contactList = await db.query.contacts.findMany({
      where: eq(contacts.userId, userId),
      columns: { contactId: true },
    });
  } catch (err) {
    console.error('[Presence] DB error fetching contacts:', err);
    return;
  }

  if (contactList.length === 0) {
    return;
  }

  const update = JSON.stringify({
    type: 'presence.update',
    payload: {
      userId,
      status,
      customStatus: presenceData.customStatus,
      lastSeen: presenceData.lastSeen,
    },
    timestamp: Date.now(),
  });

  const pipeline = redis.pipeline();
  for (const contact of contactList) {
    pipeline.publish(`user:${contact.contactId}`, update);
  }

  try {
    await pipeline.exec();
  } catch (err) {
    console.error('[Presence] Redis publish error:', err);
  }
}

export async function getBatchPresence(
  userIds: string[],
  redis: Redis
): Promise<
  Array<{
    userId: string;
    status: string;
    lastSeen: number;
    customStatus?: string;
  }>
> {
  if (userIds.length === 0) {
    return [];
  }

  const pipeline = redis.pipeline();
  userIds.forEach((id) => {
    pipeline.hgetall(`presence:${id}`);
  });

  const results = await pipeline.exec();
  if (!results) {
    return [];
  }

  return results.map((result, index) => {
    const data = (result[1] as Record<string, string>) || {};
    return {
      userId: userIds[index],
      status: data.status || 'offline',
      lastSeen: Number.parseInt(data.lastSeen || '0', 10),
      customStatus: data.customStatus,
    };
  });
}
