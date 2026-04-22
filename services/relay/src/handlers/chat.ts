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
 */

import type { Redis } from 'ioredis';
import { and, eq } from 'drizzle-orm';
import type { WsMessage } from '@presidium/shared-types';

import type { ExtendedWebSocket } from '../ws/handler.js';
import { db } from '../db/index.js';
import { chatMembers, messages } from '../db/schema.js';

const processedMessages = new Set<string>();
const DEDUP_WINDOW_MS = 300_000;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

setInterval(() => {
  processedMessages.clear();
}, DEDUP_WINDOW_MS);

export async function handleChatMessage(
  payload: {
    chatId: string;
    encryptedPayload: string;
    nonce: string;
    type?: string;
    replyTo?: string;
    clientTimestamp?: number;
    id?: string;
  },
  ws: ExtendedWebSocket,
  redis: Redis
): Promise<void> {
  const senderId = ws.userId!;
  const startTime = Date.now();

  if (payload.id) {
    const dedupKey = `${senderId}:${payload.id}`;
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

  if (!UUID_REGEX.test(payload.chatId)) {
    ws.send(
      JSON.stringify({
        type: 'chat.error',
        payload: {
          error: 'Invalid chatId format',
          code: 'INVALID_UUID',
        },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  let membership;
  try {
    membership = await db.query.chatMembers.findFirst({
      where: and(eq(chatMembers.chatId, payload.chatId), eq(chatMembers.userId, senderId)),
    });
  } catch (err) {
    console.error('[Chat] DB error checking membership:', err);
    ws.send(
      JSON.stringify({
        type: 'chat.error',
        payload: { error: 'Database error', code: 'DB_ERROR' },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  if (!membership || membership.leftAt) {
    ws.send(
      JSON.stringify({
        type: 'chat.error',
        payload: {
          error: 'Not a member of this chat',
          chatId: payload.chatId,
          code: 'NOT_MEMBER',
        },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  let message;
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
    ws.send(
      JSON.stringify({
        type: 'chat.error',
        payload: { error: 'Failed to store message', code: 'DB_ERROR' },
        timestamp: Date.now(),
      }),
      false
    );
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
    ws.send(
      JSON.stringify({
        type: 'chat.error',
        payload: { error: 'Failed to fetch members', code: 'DB_ERROR' },
        timestamp: Date.now(),
      }),
      false
    );
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

  if (!payload.chatId) {
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
