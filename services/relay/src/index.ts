/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * Presidium Relay Server
 */

import { Hono } from 'hono';
import uWS from 'uWebSockets.js';

import { config } from './config.js';
import { checkDatabaseHealth } from './db/index.js';
import { getCallStats } from './handlers/call.js';
import { startModerationWorker } from './moderation/worker.js';
import { createPubSub, redis } from './redis.js';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chats.js';
import contactsRouter from './routes/contacts.js';
import cronRouter from './routes/cron.js';
import feedRouter from './routes/feed.js';
import keysRouter from './routes/keys.js';
import mediaRouter from './routes/media.js';
import storiesRouter from './routes/stories.js';
import userRoutes from './routes/users.js';
import marketplaceRouter from './routes/marketplace.js';
import booksRouter from './routes/books.js';
import subscriptionsRouter from './routes/subscriptions.js';
import adminRouter from './routes/admin.js';
import { getLocalConnectionCount, publishToLocalUser, wsHandler } from './ws/handler.js';

const PORT = config.PORT;

const httpApp = new Hono();

httpApp.get('/health', async (c) => {
  const dbHealth = await checkDatabaseHealth();
  const callStats = getCallStats();

  return c.json({
    status: 'ok',
    version: '2.6.0',
    timestamp: Date.now(),
    uptime: process.uptime(),
    database: dbHealth,
    calls: callStats,
    connections: await redis.get('ws:connection_count'),
  });
});

httpApp.get('/metrics', (c) => {
  return c.text('# Presidium metrics\n');
});

httpApp.route('/auth', authRoutes);
httpApp.route('/users', userRoutes);
httpApp.route('/chats', chatRoutes);
httpApp.route('/stories', storiesRouter);
httpApp.route('/feed', feedRouter);
httpApp.route('/media', mediaRouter);
httpApp.route('/contacts', contactsRouter);
httpApp.route('/cron', cronRouter);

// Current root web client calls /api/keys/*.
// Relay-native clients may use /keys/* once the web app is fully migrated.
httpApp.route('/api/keys', keysRouter);
httpApp.route('/keys', keysRouter);

httpApp.route('/marketplace', marketplaceRouter);
httpApp.route('/books', booksRouter);
httpApp.route('/subscriptions', subscriptionsRouter);
httpApp.route('/admin', adminRouter);

httpApp.notFound((c) => {
  return c.json(
    {
      success: false,
      error: 'Not found',
      code: 'NOT_FOUND',
      path: c.req.path,
    },
    404
  );
});

httpApp.onError((err, c) => {
  console.error('[HTTP] Error:', err);
  return c.json(
    {
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
    500
  );
});

function copyRequestHeaders(req: any): Headers {
  const headers = new Headers();
  req.forEach((key: string, value: string) => {
    headers.append(key, value);
  });
  return headers;
}

function readRequestBody(res: any): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    let done = false;
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    res.onAborted(() => {
      if (!done) {
        done = true;
        reject(new Error('Request aborted'));
      }
    });

    res.onData((ab: ArrayBuffer, isLast: boolean) => {
      if (done) {
        return;
      }

      const chunk = new Uint8Array(ab);
      chunks.push(chunk);
      totalBytes += chunk.byteLength;

      if (!isLast) {
        return;
      }

      done = true;

      if (chunks.length === 1) {
        resolve(chunks[0] || new Uint8Array());
        return;
      }

      const body = new Uint8Array(totalBytes);
      let offset = 0;
      for (const item of chunks) {
        body.set(item, offset);
        offset += item.byteLength;
      }
      resolve(body);
    });
  });
}

async function handleHttpBridge(res: any, req: any) {
  let aborted = false;
  res.onAborted(() => {
    aborted = true;
  });

  try {
    const method = req.getMethod().toUpperCase();
    const query = req.getQuery();
    const fullUrl = `http://localhost:${PORT}${req.getUrl()}${query ? `?${query}` : ''}`;
    const headers = copyRequestHeaders(req);

    let body: BodyInit | undefined;
    const hasBodyMethod = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
    const hasBodyHint =
      Number.parseInt(req.getHeader('content-length') || '0', 10) > 0 ||
      Boolean(req.getHeader('transfer-encoding'));

    if (hasBodyMethod && hasBodyHint) {
      const bodyBytes = await readRequestBody(res);
      body = bodyBytes.byteLength > 0 ? Buffer.from(bodyBytes) : undefined;
    }

    const request = new Request(fullUrl, {
      method,
      headers,
      body,
    });

    const response = await httpApp.fetch(request);
    if (aborted) {
      return;
    }

    const statusText = response.statusText || '';
    res.writeStatus(`${response.status} ${statusText}`.trim());
    response.headers.forEach((value, key) => {
      res.writeHeader(key, value);
    });

    const raw = new Uint8Array(await response.arrayBuffer());
    if (raw.byteLength === 0) {
      res.end();
      return;
    }

    res.end(Buffer.from(raw));
  } catch (err) {
    if (aborted) {
      return;
    }
    console.error('[HTTP] Bridge error:', err);
    res.writeStatus('500 Internal Server Error');
    res.end('Internal Server Error');
  }
}

const wsApp = uWS.App();

wsApp.any('/*', (res, req) => {
  handleHttpBridge(res, req).catch((err) => {
    console.error('[HTTP] Bridge handler error:', err);
    res.writeStatus('500 Internal Server Error');
    res.end('Internal Server Error');
  });
});

wsApp.ws('/*', {
  compression: uWS.SHARED_COMPRESSOR,
  maxPayloadLength: config.WS_MAX_PAYLOAD_LENGTH,
  idleTimeout: config.WS_IDLE_TIMEOUT,
  maxBackpressure: config.WS_MAX_BACKPRESSURE,

  upgrade: (res, req, context) => {
    wsHandler.upgrade(res, req, context).catch((err) => {
      console.error('[WS] Upgrade error:', err);
      res.writeStatus('500 Internal Server Error');
      res.end();
    });
  },

  open: (ws) => {
    wsHandler
      .open(ws as any, redis)
      .then(async () => {
        await redis.incr('ws:connection_count');
      })
      .catch((err) => {
        console.error('[WS] Open error:', err);
        ws.close();
      });
  },

  message: (ws, message, isBinary) => {
    wsHandler.message(ws as any, message, isBinary, redis).catch((err) => {
      console.error('[WS] Message error:', err);
    });
  },

  close: (ws, code, message) => {
    wsHandler
      .close(ws as any, code, message, redis)
      .then(async () => {
        const count = await redis.decr('ws:connection_count');
        if (count < 0) {
          await redis.set('ws:connection_count', '0');
        }
      })
      .catch((err) => {
        console.error('[WS] Close error:', err);
      });
  },
});

const listenSocket = wsApp.listen(PORT, (token) => {
  if (!token) {
    console.error('[Presidium Relay] Failed to bind port', PORT);
    process.exit(1);
  }

  console.log(`[Presidium Relay] v2.6.0 started on port ${PORT}`);
  console.log('[Presidium Relay] Copyright (C) 2026 [Ваше Полное Имя]');
  console.log(`[Presidium Relay] Environment: ${config.NODE_ENV}`);

  if (config.MODERATION_ENABLED) {
    startModerationWorker(redis);
    console.log('[Presidium Relay] Silent Claw moderation worker started');
  }

  const { subscriber } = createPubSub();
  subscriber.psubscribe('user:*', (err) => {
    if (err) {
      console.error('[Redis] Failed to subscribe:', err);
    } else {
      console.log('[Redis] Subscribed to user:* pattern');
    }
  });

  subscriber.on('pmessage', (_pattern, channel, message) => {
    const userId = channel.slice('user:'.length);
    publishToLocalUser(userId, message);
  });

  subscriber.on('error', (err) => {
    console.error('[Redis] Subscriber error:', err);
  });
});

void listenSocket;

process.on('SIGTERM', () => {
  console.log('[Relay] SIGTERM received, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Relay] SIGINT received, shutting down...');
  process.exit(0);
});

setInterval(() => {
  redis.set('ws:connection_count', String(getLocalConnectionCount())).catch(() => undefined);
}, 10_000);
