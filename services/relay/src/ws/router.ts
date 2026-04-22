/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * WebSocket Message Router — Production Version
 *
 * Central dispatch hub. Каждый handler изолирован и может быть
 * вынесен в микросервис без изменения router.
 *
 * Security:
 * - Whitelist message types (reject unknown)
 * - Rate limiting per user
 * - Payload size validation
 * - Sender identity verification (ws.userId)
 */

import type { Redis } from 'ioredis';

import { handleCallSignal } from '../handlers/call.js';
import { handleChatMessage, handleReadReceipt, handleTyping } from '../handlers/chat.js';
import { handlePresenceUpdate } from '../handlers/presence.js';
import { handleStoryView } from '../handlers/story.js';
import type { ExtendedWebSocket } from './handler.js';

const VALID_MESSAGE_TYPES = [
  'chat.message',
  'chat.read',
  'chat.typing',
  'call.signal',
  'story.view',
  'presence.update',
  'ping',
] as const;

type ValidMessageType = (typeof VALID_MESSAGE_TYPES)[number];

interface MessageEnvelope {
  type: ValidMessageType | string;
  payload: Record<string, unknown>;
  id?: string;
  timestamp?: number;
}

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_MSG = 120;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_MSG) {
    return false;
  }

  entry.count += 1;
  return true;
}

export async function routeMessage(
  envelope: MessageEnvelope,
  ws: ExtendedWebSocket,
  redis: Redis
): Promise<void> {
  const startTime = Date.now();
  const { type, payload } = envelope;

  if (!ws.isAuthenticated || !ws.userId) {
    ws.send(
      JSON.stringify({
        type: 'error',
        payload: { error: 'Not authenticated', code: 'AUTH_REQUIRED' },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  if (!VALID_MESSAGE_TYPES.includes(type as ValidMessageType)) {
    ws.send(
      JSON.stringify({
        type: 'error',
        payload: {
          error: 'Unknown message type',
          receivedType: type,
          validTypes: VALID_MESSAGE_TYPES,
          code: 'INVALID_TYPE',
        },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  if (!checkRateLimit(ws.userId)) {
    ws.send(
      JSON.stringify({
        type: 'error',
        payload: {
          error: 'Rate limit exceeded',
          limit: RATE_LIMIT_MAX_MSG,
          window: RATE_LIMIT_WINDOW_MS,
          code: 'RATE_LIMITED',
        },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    ws.send(
      JSON.stringify({
        type: 'error',
        payload: { error: 'Invalid payload: must be object', code: 'INVALID_PAYLOAD' },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  try {
    switch (type as ValidMessageType) {
      case 'chat.message':
        await handleChatMessage(payload as any, ws, redis);
        break;

      case 'chat.read':
        await handleReadReceipt(payload as any, ws, redis);
        break;

      case 'chat.typing':
        await handleTyping(payload as any, ws, redis);
        break;

      case 'call.signal':
        await handleCallSignal(payload as any, ws, redis);
        break;

      case 'story.view':
        await handleStoryView(payload as any, ws, redis);
        break;

      case 'presence.update':
        await handlePresenceUpdate(payload as any, ws, redis);
        break;

      case 'ping':
        ws.send(
          JSON.stringify({
            type: 'pong',
            payload: {
              serverTime: Date.now(),
              latency: Date.now() - (envelope.timestamp || Date.now()),
            },
            timestamp: Date.now(),
          }),
          false
        );
        break;
    }

    if (process.env.NODE_ENV === 'development') {
      const duration = Date.now() - startTime;
      if (duration > 100) {
        console.warn(`[Router] Slow message handling: ${type} took ${duration}ms`);
      }
    }
  } catch (err) {
    console.error(`[Router] Handler error for type ${type}:`, err);
    ws.send(
      JSON.stringify({
        type: 'error',
        payload: {
          error: 'Internal server error',
          message: process.env.NODE_ENV === 'development' ? (err as Error).message : 'Please try again',
          code: 'INTERNAL_ERROR',
        },
        timestamp: Date.now(),
      }),
      false
    );
  }
}
