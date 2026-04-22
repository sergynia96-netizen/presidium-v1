/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * WebSocket Connection Handler
 */

import type { Redis } from 'ioredis';
import type { WebSocket } from 'uWebSockets.js';
import { eq } from 'drizzle-orm';

import { extractTokenFromUrl, verifyToken } from '../auth/jwt.js';
import { db } from '../db/index.js';
import { contacts } from '../db/schema.js';
import { endUserCalls } from '../handlers/call.js';
import { routeMessage } from './router.js';

interface UpgradeData {
  token: string;
  deviceId?: string;
}

export interface ExtendedWebSocket extends WebSocket<UpgradeData> {
  userId?: string;
  deviceId?: string;
  isAuthenticated?: boolean;
  lastPingAt?: number;
}

const localSockets = new Map<string, Set<ExtendedWebSocket>>();

function addLocalSocket(userId: string, ws: ExtendedWebSocket) {
  if (!localSockets.has(userId)) {
    localSockets.set(userId, new Set());
  }
  localSockets.get(userId)!.add(ws);
}

function removeLocalSocket(userId: string, ws: ExtendedWebSocket) {
  const sockets = localSockets.get(userId);
  if (!sockets) {
    return;
  }

  sockets.delete(ws);
  if (sockets.size === 0) {
    localSockets.delete(userId);
  }
}

export function publishToLocalUser(userId: string, rawMessage: string) {
  const sockets = localSockets.get(userId);
  if (!sockets || sockets.size === 0) {
    return;
  }

  for (const socket of sockets) {
    try {
      socket.send(rawMessage, false);
    } catch {
      // Ignore per-socket send failures; close lifecycle will clean up.
    }
  }
}

export function getLocalConnectionCount(): number {
  let total = 0;
  for (const sockets of localSockets.values()) {
    total += sockets.size;
  }
  return total;
}

export const wsHandler = {
  async upgrade(res: any, req: any, context: any): Promise<void> {
    const query = req.getQuery();
    const fullUrl = query ? `${req.getUrl()}?${query}` : req.getUrl();
    const { token, deviceId } = extractTokenFromUrl(fullUrl);

    if (!token) {
      res.writeStatus('401 Unauthorized');
      res.writeHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'JWT token required in query param: ?token=JWT',
        })
      );
      return;
    }

    let aborted = false;
    res.onAborted(() => {
      aborted = true;
    });

    try {
      await verifyToken(token);
      if (aborted) {
        return;
      }

      res.upgrade(
        { token, deviceId } as UpgradeData,
        req.getHeader('sec-websocket-key'),
        req.getHeader('sec-websocket-protocol'),
        req.getHeader('sec-websocket-extensions'),
        context
      );
    } catch {
      if (aborted) {
        return;
      }

      res.writeStatus('401 Unauthorized');
      res.writeHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'Unauthorized',
          message: 'Invalid or expired token',
        })
      );
    }
  },

  async open(ws: ExtendedWebSocket, redis: Redis): Promise<void> {
    try {
      const data = ws.getUserData() as UpgradeData;
      const payload = await verifyToken(data.token);

      ws.userId = payload.sub;
      ws.deviceId = data.deviceId || payload.deviceId || 'unknown';
      ws.isAuthenticated = true;
      ws.lastPingAt = Date.now();

      addLocalSocket(payload.sub, ws);

      await redis.sadd(`user:sockets:${payload.sub}`, ws.deviceId);

      await redis.hset(`presence:${payload.sub}`, {
        status: 'online',
        lastSeen: Date.now(),
        deviceId: ws.deviceId,
      });

      const offlineKey = `offline:${payload.sub}`;
      const queuedMessages = await redis.lrange(offlineKey, 0, -1);

      if (queuedMessages.length > 0) {
        for (const message of queuedMessages) {
          ws.send(message, false);
        }
        await redis.del(offlineKey);
      }

      ws.send(
        JSON.stringify({
          type: 'auth.success',
          payload: {
            userId: payload.sub,
            deviceId: ws.deviceId,
            tier: payload.tier || 'free',
            serverTime: Date.now(),
          },
          timestamp: Date.now(),
        }),
        false
      );

      await broadcastPresence(payload.sub, 'online', redis);
    } catch (err) {
      console.error('[WS] Auth failed in open handler:', err);

      ws.send(
        JSON.stringify({
          type: 'auth.error',
          payload: {
            error: 'Authentication failed',
            message: err instanceof Error ? err.message : 'Unknown error',
          },
          timestamp: Date.now(),
        }),
        false
      );

      ws.close();
    }
  },

  async message(
    ws: ExtendedWebSocket,
    message: ArrayBuffer,
    isBinary: boolean,
    redis: Redis
  ): Promise<void> {
    if (!ws.isAuthenticated || !ws.userId) {
      ws.send(
        JSON.stringify({
          type: 'error',
          payload: { error: 'Not authenticated' },
          timestamp: Date.now(),
        }),
        false
      );
      return;
    }

    try {
      if (isBinary) {
        return;
      }

      const text = Buffer.from(message).toString('utf-8');
      const envelope = JSON.parse(text);

      if (!envelope.type || !envelope.payload) {
        ws.send(
          JSON.stringify({
            type: 'error',
            payload: { error: 'Invalid message format: missing type or payload' },
            timestamp: Date.now(),
          }),
          false
        );
        return;
      }

      await routeMessage(envelope, ws, redis);
    } catch (err) {
      console.error('[WS] Message handling error:', err);
      ws.send(
        JSON.stringify({
          type: 'error',
          payload: {
            error: 'Invalid message',
            message: err instanceof Error ? err.message : 'Unknown error',
          },
          timestamp: Date.now(),
        }),
        false
      );
    }
  },

  async close(
    ws: ExtendedWebSocket,
    _code: number,
    _message: ArrayBuffer,
    redis: Redis
  ): Promise<void> {
    if (!ws.userId) {
      return;
    }

    try {
      await endUserCalls(ws.userId, redis);
    } catch (err) {
      console.warn('[WS] Failed to cleanup active calls:', err);
    }

    removeLocalSocket(ws.userId, ws);

    await redis.srem(`user:sockets:${ws.userId}`, ws.deviceId || 'unknown');

    const remaining = await redis.scard(`user:sockets:${ws.userId}`);

    if (remaining === 0) {
      await redis.hset(`presence:${ws.userId}`, {
        status: 'recently',
        lastSeen: Date.now(),
      });

      await broadcastPresence(ws.userId, 'offline', redis);
    }

    ws.userId = undefined;
    ws.deviceId = undefined;
    ws.isAuthenticated = false;
  },
};

async function broadcastPresence(
  userId: string,
  status: 'online' | 'offline' | 'recently',
  redis: Redis
): Promise<void> {
  try {
    const userContacts = await db.query.contacts.findMany({
      where: eq(contacts.userId, userId),
      columns: { contactId: true },
    });

    const presenceUpdate = JSON.stringify({
      type: 'presence.update',
      payload: {
        userId,
        status,
        lastSeen: Date.now(),
      },
      timestamp: Date.now(),
    });

    for (const contact of userContacts) {
      await redis.publish(`user:${contact.contactId}`, presenceUpdate);
    }
  } catch (err) {
    console.error('[WS] Failed to broadcast presence:', err);
  }
}
