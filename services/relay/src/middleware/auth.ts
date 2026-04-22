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
};

export interface AuthContext {
  userId: string;
  email: string;
  tokenPayload: TokenPayload;
}

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

    const user = await db.query.users.findFirst({
      where: eq(users.id, sub),
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
      return c.json(
        {
          success: false,
          error: 'User not found',
          code: 'AUTH_USER_NOT_FOUND',
        },
        401
      );
    }

    if (user.status === 'banned') {
      return c.json(
        {
          success: false,
          error: 'Account banned',
          code: 'AUTH_BANNED',
        },
        403
      );
    }

    c.set('auth', {
      userId: user.id,
      email: user.email,
      tokenPayload: payload,
    } as AuthContext);

    c.set('user', {
      id: user.id,
      email: user.email,
      name: user.name,
      strikes: user.strikes,
      createdAt: user.createdAt,
    } as AuthUser);

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

    if (user && !user.deletedAt && user.status !== 'banned') {
      c.set('auth', {
        userId: user.id,
        email: user.email,
        tokenPayload: payload,
      } as AuthContext);

      c.set('user', {
        id: user.id,
        email: user.email,
        name: user.name,
        strikes: user.strikes,
        createdAt: user.createdAt,
      } as AuthUser);
    }
  } catch {
    // optional auth ignores invalid token
  }

  await next();
});
