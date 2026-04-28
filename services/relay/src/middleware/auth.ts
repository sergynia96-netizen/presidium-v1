import { createMiddleware } from 'hono/factory';
import { eq } from 'drizzle-orm';

import { verifyToken, type TokenPayload } from '../auth/jwt.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  strikes: number;
  createdAt: Date;
  source?: 'relay' | 'legacy-web';
};

export interface AuthContext {
  userId: string;
  email: string;
  tokenPayload: TokenPayload;
  source?: 'relay' | 'legacy-web';
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }
  return token;
}

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function setLegacyWebAuthContext(c: unknown, payload: TokenPayload): void {
  const ctx = c as { set: (key: string, value: unknown) => void };
  const now = new Date();
  const email = typeof payload.email === 'string' ? payload.email : '';

  ctx.set('auth', {
    userId: payload.sub,
    email,
    tokenPayload: payload,
    source: 'legacy-web',
  } as AuthContext);

  ctx.set('user', {
    id: payload.sub,
    email,
    name: email || payload.sub,
    strikes: 0,
    createdAt: now,
    source: 'legacy-web',
  } as AuthUser);
}

async function setRelayAuthContext(c: unknown, payload: TokenPayload): Promise<'ok' | Response> {
  const ctx = c as {
    set: (key: string, value: unknown) => void;
    json: (body: unknown, status?: number) => Response;
  };

  const user = await db.query.users.findFirst({
    where: eq(users.id, payload.sub),
    columns: {
      id: true,
      email: true,
      name: true,
      strikes: true,
      createdAt: true,
      status: true,
      deletedAt: true,
    },
  });

  if (!user || user.deletedAt) {
    return ctx.json(
      {
        success: false,
        error: 'User not found',
        code: 'AUTH_USER_NOT_FOUND',
      },
      401
    );
  }

  if (user.status === 'banned') {
    return ctx.json(
      {
        success: false,
        error: 'Account banned',
        code: 'AUTH_BANNED',
      },
      403
    );
  }

  ctx.set('auth', {
    userId: user.id,
    email: user.email,
    tokenPayload: payload,
    source: 'relay',
  } as AuthContext);

  ctx.set('user', {
    id: user.id,
    email: user.email,
    name: user.name,
    strikes: user.strikes,
    createdAt: user.createdAt,
    source: 'relay',
  } as AuthUser);

  return 'ok';
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const token = parseBearerToken(
    c.req.header('Authorization') || c.req.header('authorization')
  );

  if (!token) {
    return c.json(
      {
        success: false,
        error: 'Missing or invalid Authorization header',
        code: 'AUTH_MISSING',
      },
      401
    );
  }

  try {
    const payload = await verifyToken(token);

    const sub = payload.sub;
    if (!sub) {
      return c.json(
        {
          success: false,
          error: 'Invalid token payload',
          code: 'AUTH_INVALID_TOKEN',
        },
        401
      );
    }

    if (!isUuid(sub)) {
      // Compatibility path for the current root web app.
      // Its Prisma users use cuid() identifiers, while the relay Postgres users table
      // uses UUID. We still accept the cryptographically valid relay token and mark
      // the auth source so DB-native routes can migrate intentionally.
      setLegacyWebAuthContext(c, payload);
      await next();
      return;
    }

    const result = await setRelayAuthContext(c, payload);
    if (result !== 'ok') {
      return result;
    }

    await next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid token';
    return c.json(
      {
        success: false,
        error: message,
        code: 'AUTH_INVALID_TOKEN',
      },
      401
    );
  }
});

export const optionalAuthMiddleware = createMiddleware(async (c, next) => {
  const token = parseBearerToken(
    c.req.header('Authorization') || c.req.header('authorization')
  );

  if (!token) {
    await next();
    return;
  }

  try {
    const payload = await verifyToken(token);
    if (!payload.sub) {
      await next();
      return;
    }

    if (!isUuid(payload.sub)) {
      setLegacyWebAuthContext(c, payload);
      await next();
      return;
    }

    const result = await setRelayAuthContext(c, payload);
    if (result !== 'ok') {
      await next();
      return;
    }
  } catch {
    // optional auth ignores invalid token
  }

  await next();
});
