/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * Authentication Routes
 */

import bcrypt from 'bcryptjs';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { PresidiumCrypto } from '@presidium/shared-crypto';

import { createRefreshToken, createToken, verifyToken } from '../auth/jwt.js';
import { db } from '../db/index.js';
import { sessions, users } from '../db/schema.js';
import { authMiddleware, type AuthContext } from '../middleware/auth.js';
import { authRateLimit } from '../middleware/rate-limit.js';

const app = new Hono();

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

function validatePasswordStrength(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 10) {
    errors.push('Password must be at least 10 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must include uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must include lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must include digit');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must include special character');
  }
  return { valid: errors.length === 0, errors };
}

function getAuth(c: unknown): AuthContext {
  return (c as { get: (key: string) => unknown }).get('auth') as AuthContext;
}

app.post('/register', authRateLimit, zValidator('json', registerSchema), async (c) => {
  const body = c.req.valid('json');

  try {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, body.email),
      columns: { id: true },
    });

    if (existing) {
      return c.json(
        {
          success: false,
          error: 'Email already registered',
          code: 'EMAIL_EXISTS',
        },
        409
      );
    }

    const passwordCheck = validatePasswordStrength(body.password);
    if (!passwordCheck.valid) {
      return c.json(
        {
          success: false,
          error: 'Password too weak',
          details: passwordCheck.errors,
          code: 'WEAK_PASSWORD',
        },
        400
      );
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    const signingIdentity = PresidiumCrypto.generateKeyPair();
    const encryptionIdentity = PresidiumCrypto.generateKeyPair();

    const [user] = await db
      .insert(users)
      .values({
        name: body.name,
        email: body.email,
        passwordHash,
        publicKey: signingIdentity.publicKey,
        encryptionKey: encryptionIdentity.publicKey,
        subscriptionTier: 'free',
        privacyTier: 'guardian',
        status: 'active',
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
      });

    const deviceId = 'web';
    const accessToken = await createToken(user.id, user.email, deviceId);
    const refreshToken = await createRefreshToken(user.id, deviceId);
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);

    await db.insert(sessions).values({
      userId: user.id,
      refreshTokenHash,
      deviceId,
      deviceType: 'web',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    return c.json(
      {
        success: true,
        data: {
          user,
          tokens: {
            accessToken,
            refreshToken,
            expiresIn: 7 * 24 * 60 * 60,
          },
        },
      },
      201
    );
  } catch (err) {
    console.error('[Auth] Register error:', err);
    return c.json(
      {
        success: false,
        error: 'Registration failed',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

app.post('/login', authRateLimit, zValidator('json', loginSchema), async (c) => {
  const body = c.req.valid('json');

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email),
    });

    if (!user || !user.passwordHash) {
      return c.json(
        {
          success: false,
          error: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
        },
        401
      );
    }

    if (user.status === 'banned') {
      return c.json(
        {
          success: false,
          error: 'Account banned',
          code: 'ACCOUNT_BANNED',
        },
        403
      );
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      return c.json(
        {
          success: false,
          error: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS',
        },
        401
      );
    }

    const deviceId = c.req.header('X-Device-Id') || 'web';
    const accessToken = await createToken(user.id, user.email, deviceId);
    const refreshToken = await createRefreshToken(user.id, deviceId);

    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await db.insert(sessions).values({
      userId: user.id,
      refreshTokenHash,
      deviceId,
      deviceType: 'web',
      ipAddress:
        c.req.header('X-Forwarded-For') ||
        c.req.header('x-forwarded-for') ||
        c.req.header('X-Real-IP') ||
        c.req.header('x-real-ip') ||
        null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    await db
      .update(users)
      .set({ lastSeenAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    return c.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          publicKey: user.publicKey,
          encryptionKey: user.encryptionKey,
          subscriptionTier: user.subscriptionTier,
          privacyTier: user.privacyTier,
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: 7 * 24 * 60 * 60,
        },
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    return c.json(
      {
        success: false,
        error: 'Login failed',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

app.post('/refresh', authRateLimit, zValidator('json', refreshSchema), async (c) => {
  const { refreshToken } = c.req.valid('json');

  try {
    const payload = await verifyToken(refreshToken, 'presidium-refresh');
    const userId = payload.sub;

    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.userId, userId), eq(sessions.revoked, false)),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
    });

    if (!session) {
      return c.json(
        {
          success: false,
          error: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN',
        },
        401
      );
    }

    if (new Date() > session.expiresAt) {
      return c.json(
        {
          success: false,
          error: 'Refresh token expired',
          code: 'REFRESH_EXPIRED',
        },
        401
      );
    }

    const valid = await bcrypt.compare(refreshToken, session.refreshTokenHash);
    if (!valid) {
      return c.json(
        {
          success: false,
          error: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN',
        },
        401
      );
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, email: true, status: true },
    });

    if (!user || user.status === 'banned') {
      return c.json(
        {
          success: false,
          error: 'Account unavailable',
          code: 'ACCOUNT_UNAVAILABLE',
        },
        403
      );
    }

    const newAccessToken = await createToken(user.id, user.email, session.deviceId);
    const newRefreshToken = await createRefreshToken(user.id, session.deviceId);

    await db
      .update(sessions)
      .set({ revoked: true })
      .where(eq(sessions.id, session.id));

    const newRefreshHash = await bcrypt.hash(newRefreshToken, 10);
    await db.insert(sessions).values({
      userId: user.id,
      refreshTokenHash: newRefreshHash,
      deviceId: session.deviceId,
      deviceType: session.deviceType,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    return c.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 7 * 24 * 60 * 60,
      },
    });
  } catch (err) {
    console.error('[Auth] Refresh error:', err);
    return c.json(
      {
        success: false,
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      },
      401
    );
  }
});

app.post('/logout', authMiddleware, async (c) => {
  const auth = getAuth(c);

  try {
    await db
      .update(sessions)
      .set({ revoked: true })
      .where(eq(sessions.userId, auth.userId));

    return c.json({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  } catch (err) {
    console.error('[Auth] Logout error:', err);
    return c.json(
      {
        success: false,
        error: 'Logout failed',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

app.get('/me', authMiddleware, async (c) => {
  const auth = getAuth(c);

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, auth.userId),
      columns: {
        id: true,
        name: true,
        email: true,
        avatar: true,
        publicKey: true,
        encryptionKey: true,
        subscriptionTier: true,
        privacyTier: true,
        strikes: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) {
      return c.json(
        {
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        },
        404
      );
    }

    return c.json({
      success: true,
      data: user,
    });
  } catch (err) {
    console.error('[Auth] Me error:', err);
    return c.json(
      {
        success: false,
        error: 'Failed to fetch profile',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

export default app;
