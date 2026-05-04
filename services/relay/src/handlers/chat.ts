/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * Chat Message Handlers — Production Version
 *
 * Полный цикл E2EE сообщения:
 * 1. Валидация: отправитель — участник чата?
 * 2. Хранение: metadata в PostgreSQL (encryptedPayload — blob)
 * 3. Модерация: async queue (не блокируем доставку)
 * 4. Доставка: online → Redis pub/sub, offline → Redis list
 * 5. Подтверждение: ack отправителю со статусом
 *
 * Compatibility bridge:
 * While the root web app still creates chats through the legacy Prisma/SQLite
 * model with cuid() identifiers, the relay can temporarily deliver opaque E2E
 * envelopes directly by recipientId. This keeps realtime messaging usable while
 * the web chat API is migrated to the canonical Drizzle/Postgres relay schema.
 */

import type { Redis } from 'ioredis';
import { and, eq } from 'drizzle-orm';
import type { WsMessage } from '@presidium/shared-types';

import type { ExtendedWebSocket } from '../ws/handler.js';
import { db } from '../db/index.js';
import { chatMembers, messages } from '../db/schema.js';
import { DrizzleOutboxRepository } from '../db/repositories/index.js';
import type { OutboxEntry, TimestampMs } from '../types/messaging.js';

const processedMessages = new Set<string>();
const DEDUP_WINDOW_MS = 300_000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ChatMessagePayload = {
  chatId: string;
  recipientId?: string;
  encryptedPayload: string;
  nonce: string;
  type?: string;
  replyTo?: string;
  clientTimestamp?: number;
  id?: string;
};

setInterval(() => {
  processedMessages.clear();
}, DEDUP_WINDOW_MS);

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function getDedupKey(senderId: string, messageId?: string): string | null {
  return messageId ? `${senderId}:${messageId}` : null;
}

async function deliverTransportFallback(
  payload: ChatMessagePayload,
  senderId: string,
  ws: ExtendedWebSocket,
  redis: Redis,
  reason: 'NON_UUID_CHAT_ID' | 'NOT_MEMBER' | 'MEMBERSHIP_DB_ERROR' | 'MESSAGE_DB_ERROR'
): Promise<void> {
  if (!payload.recipientId || payload.recipientId === senderId) {
    ws.send(
      JSON.stringify({
        type: 'chat.error',
        payload: {
          error: 'Relay transport fallback requires recipientId',
          chatId: payload.chatId,
          code: reason,
        },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  const now = Date.now();
  const messageId = payload.id || `${senderId}:${now}`;
  const message: WsMessage = {
    type: 'chat.message',
    payload: {
      id: messageId,
      chatId: payload.chatId,
      senderId,
      senderName: ws.deviceId || 'User',
      recipientId: payload.recipientId,
      encryptedPayload: payload.encryptedPayload,
      nonce: payload.nonce,
      type: payload.type || 'text',
      replyTo: payload.replyTo,
      createdAt: now,
      clientTimestamp: payload.clientTimestamp,
      mode: 'transport_fallback',
      fallbackReason: reason,
    },
    timestamp: now,
  };

  const messageJson = JSON.stringify(message);
  const recipientPresence = await redis.hget(`presence:${payload.recipientId}`, 'status').catch(() => null);
  const isOnline = recipientPresence === 'online';

  if (isOnline) {
    await redis.publish(`user:${payload.recipientId}`, messageJson);
  } else {
    await redis.rpush(`offline:${payload.recipientId}`, messageJson);
    await redis.expire(`offline:${payload.recipientId}`, 7 * 24 * 60 * 60);
  }

  ws.send(
    JSON.stringify({
      type: 'chat.ack',
      payload: {
        messageId,
        clientId: payload.id,
        status: isOnline ? 'delivered' : 'sent',
        deliveredCount: isOnline ? 1 : 0,
        offlineCount: isOnline ? 0 : 1,
        totalMembers: 1,
        mode: 'transport_fallback',
        reason,
      },
      timestamp: Date.now(),
    }),
    false
  );
}

export async function handleChatMessage(
  payload: ChatMessagePayload,
  ws: ExtendedWebSocket,
  redis: Redis
): Promise<void> {
  const senderId = ws.userId!;
  const startTime = Date.now();

  if (!payload.chatId || !payload.encryptedPayload || !payload.nonce) {
    ws.send(
      JSON.stringify({
        type: 'chat.error',
        payload: {
          error: 'Missing required fields',
          required: ['chatId', 'encryptedPayload', 'nonce'],
          code: 'VALIDATION_ERROR',
        },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  const dedupKey = getDedupKey(senderId, payload.id);
  if (dedupKey) {
    if (processedMessages.has(dedupKey)) {
      ws.send(
        JSON.stringify({
          type: 'chat.ack',
          payload: {
            clientId: payload.id,
            status: 'deduplicated',
            message: 'Message already processed',
          },
          timestamp: Date.now(),
        }),
        false
      );
      return;
    }
    processedMessages.add(dedupKey);
  }

  if (!isUuid(payload.chatId)) {
    await deliverTransportFallback(payload, senderId, ws, redis, 'NON_UUID_CHAT_ID');
    return;
  }

  let membership;
  try {
    membership = await db.query.chatMembers.findFirst({
      where: and(eq(chatMembers.chatId, payload.chatId), eq(chatMembers.userId, senderId)),
    });
  } catch (err) {
    console.error('[Chat] DB error checking membership:', err);
    await deliverTransportFallback(payload, senderId, ws, redis, 'MEMBERSHIP_DB_ERROR');
    return;
  }

  if (!membership || membership.leftAt) {
    await deliverTransportFallback(payload, senderId, ws, redis, 'NOT_MEMBER');
    return;
  }

  let message: { id: string; createdAt: Date } | undefined;
  try {
    [message] = await db
      .insert(messages)
      .values({
        chatId: payload.chatId,
        senderId,
        encryptedPayload: payload.encryptedPayload,
        nonce: payload.nonce,
        type: payload.type || 'text',
        status: 'sent',
        replyTo: payload.replyTo,
        clientTimestamp: payload.clientTimestamp ? new Date(payload.clientTimestamp) : null,
      })
      .returning({
        id: messages.id,
        createdAt: messages.createdAt,
      });
  } catch (err) {
    console.error('[Chat] DB error storing message:', err);
    await deliverTransportFallback(payload, senderId, ws, redis, 'MESSAGE_DB_ERROR');
    return;
  }

  if (!message) {
    await deliverTransportFallback(payload, senderId, ws, redis, 'MESSAGE_DB_ERROR');
    return;
  }

  if (process.env.MODERATION_ENABLED !== 'false') {
    try {
      await redis.lpush(
        'silent-claw:queue',
        JSON.stringify({
          messageId: message.id,
          senderId,
          chatId: payload.chatId,
          timestamp: Date.now(),
          senderStrikes: 0,
          messageType: payload.type || 'text',
          accountAge: 0,
        })
      );
    } catch (err) {
      console.warn('[Chat] Failed to queue moderation:', err);
    }
  }

  let members;
  try {
    members = await db.query.chatMembers.findMany({
      where: eq(chatMembers.chatId, payload.chatId),
      columns: { userId: true },
    });
  } catch (err) {
    console.error('[Chat] DB error fetching members:', err);
    await deliverTransportFallback(payload, senderId, ws, redis, 'MEMBERSHIP_DB_ERROR');
    return;
  }

  const wsMessage: WsMessage = {
    type: 'chat.message',
    payload: {
      id: message.id,
      chatId: payload.chatId,
      senderId,
      senderName: ws.deviceId || 'User',
      encryptedPayload: payload.encryptedPayload,
      nonce: payload.nonce,
      type: payload.type || 'text',
      replyTo: payload.replyTo,
      createdAt: message.createdAt.getTime(),
      clientTimestamp: payload.clientTimestamp,
    },
    timestamp: Date.now(),
  };

  const messageJson = JSON.stringify(wsMessage);
  const memberIds = members
    .filter((member) => member.userId !== senderId)
    .map((member) => member.userId);

  let presenceResults: (string | null)[] = [];
  if (memberIds.length > 0) {
    const presencePipeline = redis.pipeline();
    memberIds.forEach((id) => {
      presencePipeline.hget(`presence:${id}`, 'status');
    });

    try {
      const rawResults = await presencePipeline.exec();
      presenceResults =
        rawResults?.map((row) => {
          if (!row || row[0]) {
            return null;
          }
          return (row[1] as string | null) ?? null;
        }) ?? [];
    } catch (err) {
      console.warn('[Chat] Failed to fetch presence:', err);
      presenceResults = memberIds.map(() => null);
    }
  }

  // ── Outbox: enqueue delivery tracking for each recipient ──────────────
  // Fire-and-forget: outbox failure must NOT block message delivery.
  if (memberIds.length > 0) {
    try {
      const outboxRepo = new DrizzleOutboxRepository(db);
      const nowMs = Date.now() as unknown as TimestampMs;
      const baseEntry: Omit<OutboxEntry, 'messageId'> = {
        status: 'pending',
        retryCount: 0,
        enqueuedAt: nowMs,
        version: 1,
      };

      const enqueuePromises = memberIds.map((memberId) =>
        outboxRepo.enqueue(
          { ...baseEntry, messageId: message.id as unknown as OutboxEntry['messageId'] },
          { recipientId: memberId as unknown as import('../types/messaging.js').UserId },
        ),
      );
      await Promise.all(enqueuePromises);
    } catch (err) {
      console.warn('[Chat] Failed to enqueue outbox entries:', err);
    }
  }

  let onlineCount = 0;
  let offlineCount = 0;
  const deliveryPipeline = redis.pipeline();

  for (let i = 0; i < memberIds.length; i += 1) {
    const memberId = memberIds[i];
    const isOnline = presenceResults[i] === 'online';

    if (isOnline) {
      deliveryPipeline.publish(`user:${memberId}`, messageJson);
      onlineCount += 1;
    } else {
      deliveryPipeline.rpush(`offline:${memberId}`, messageJson);
      deliveryPipeline.expire(`offline:${memberId}`, 7 * 24 * 60 * 60);
      offlineCount += 1;
    }
  }

  if (memberIds.length > 0) {
    try {
      await deliveryPipeline.exec();
    } catch (err) {
      console.error('[Chat] Redis delivery error:', err);
    }
  }

  if (onlineCount > 0) {
    try {
      await db.update(messages).set({ status: 'delivered' }).where(eq(messages.id, message.id));
    } catch (err) {
      console.warn('[Chat] Failed to update status:', err);
    }
  }

  const processingTime = Date.now() - startTime;
  ws.send(
    JSON.stringify({
      type: 'chat.ack',
      payload: {
        messageId: message.id,
        clientId: payload.id,
        status: onlineCount > 0 ? 'delivered' : 'sent',
        deliveredCount: onlineCount,
        offlineCount,
        totalMembers: memberIds.length,
        processingTimeMs: processingTime,
        mode: 'postgres_metadata',
      },
      timestamp: Date.now(),
    }),
    false
  );

  if (processingTime > 500) {
    console.warn(`[Chat] Slow message processing: ${processingTime}ms for chat ${payload.chatId}`);
  }
}

export async function handleReadReceipt(
  payload: {
    messageId: string;
    chatId: string;
  },
  ws: ExtendedWebSocket,
  redis: Redis
): Promise<void> {
  const readerId = ws.userId!;

  if (!payload.messageId || !payload.chatId) {
    ws.send(
      JSON.stringify({
        type: 'chat.read.error',
        payload: { error: 'Missing messageId or chatId', code: 'VALIDATION_ERROR' },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  if (!isUuid(payload.chatId)) {
    ws.send(
      JSON.stringify({
        type: 'chat.read.ack',
        payload: {
          messageId: payload.messageId,
          status: 'ignored_legacy_chat',
          mode: 'transport_fallback',
        },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  const membership = await db.query.chatMembers.findFirst({
    where: and(eq(chatMembers.chatId, payload.chatId), eq(chatMembers.userId, readerId)),
  });
  if (!membership || membership.leftAt) {
    ws.send(
      JSON.stringify({
        type: 'chat.read.error',
        payload: { error: 'Not a member of this chat', code: 'NOT_MEMBER' },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  try {
    await db.update(messages).set({ status: 'read' }).where(eq(messages.id, payload.messageId));
  } catch (err) {
    console.error('[Chat] DB error updating read status:', err);
    ws.send(
      JSON.stringify({
        type: 'chat.read.error',
        payload: { error: 'Database error', code: 'DB_ERROR' },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  let senderId: string | null = null;
  try {
    const message = await db.query.messages.findFirst({
      where: eq(messages.id, payload.messageId),
      columns: { senderId: true },
    });
    senderId = message?.senderId ?? null;
  } catch (err) {
    console.error('[Chat] DB error fetching sender:', err);
  }

  if (senderId && senderId !== readerId) {
    try {
      await redis.publish(
        `user:${senderId}`,
        JSON.stringify({
          type: 'chat.read',
          payload: {
            messageId: payload.messageId,
            chatId: payload.chatId,
            readBy: readerId,
            readAt: Date.now(),
          },
          timestamp: Date.now(),
        })
      );
    } catch (err) {
      console.warn('[Chat] Failed to notify sender:', err);
    }
  }

  ws.send(
    JSON.stringify({
      type: 'chat.read.ack',
      payload: {
        messageId: payload.messageId,
        status: 'read',
      },
      timestamp: Date.now(),
    }),
    false
  );
}

export async function handleTyping(
  payload: {
    chatId: string;
    isTyping: boolean;
  },
  ws: ExtendedWebSocket,
  redis: Redis
): Promise<void> {
  const senderId = ws.userId!;

  if (!payload.chatId || !isUuid(payload.chatId)) {
    return;
  }

  const membership = await db.query.chatMembers.findFirst({
    where: and(eq(chatMembers.chatId, payload.chatId), eq(chatMembers.userId, senderId)),
  });
  if (!membership || membership.leftAt) {
    return;
  }

  let members;
  try {
    members = await db.query.chatMembers.findMany({
      where: eq(chatMembers.chatId, payload.chatId),
      columns: { userId: true },
    });
  } catch (err) {
    console.error('[Chat] DB error fetching members for typing:', err);
    return;
  }

  const typingUpdate = JSON.stringify({
    type: 'chat.typing',
    payload: {
      chatId: payload.chatId,
      userId: senderId,
      isTyping: payload.isTyping,
    },
    timestamp: Date.now(),
  });

  const pipeline = redis.pipeline();
  for (const member of members) {
    if (member.userId === senderId) {
      continue;
    }
    pipeline.publish(`user:${member.userId}`, typingUpdate);
  }

  try {
    await pipeline.exec();
  } catch (err) {
    console.warn('[Chat] Failed to broadcast typing:', err);
  }
}
