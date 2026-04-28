import { Hono } from 'hono';
import { and, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../db/index.js';
import { users } from '../db/schema.js';

const app = new Hono();

const syncWebUserSchema = z.object({
  legacyWebUserId: z.string().min(1),
  email: z.string().email(),
  name: z.string().trim().min(1).max(255).optional(),
  avatar: z.string().trim().max(4096).optional(),
});

function getInternalApiKey(): string {
  return process.env.INTERNAL_API_KEY || '';
}

function hasValidInternalAuthHeader(header: string | undefined): boolean {
  const internalApiKey = getInternalApiKey();
  if (!internalApiKey || !header) {
    return false;
  }
  return header === `Bearer ${internalApiKey}`;
}

app.post('/users/sync-web-user', async (c) => {
  const authHeader = c.req.header('authorization') || c.req.header('Authorization');
  if (!hasValidInternalAuthHeader(authHeader)) {
    return c.json({ success: false, error: 'Unauthorized', code: 'IDENTITY_AUTH_INVALID' }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = syncWebUserSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: 'Invalid sync payload',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
      400
    );
  }

  const now = new Date();
  const relayName = parsed.data.name?.trim() || parsed.data.email;
  const relayAvatar = parsed.data.avatar?.trim() || '';

  const matchByLegacy = eq(users.legacyWebUserId, parsed.data.legacyWebUserId);
  const matchByEmailWithoutLegacy = and(
    eq(users.email, parsed.data.email),
    isNull(users.legacyWebUserId)
  );

  const existing = await db.query.users.findFirst({
    where: or(matchByLegacy, matchByEmailWithoutLegacy),
    columns: {
      id: true,
    },
  });

  if (!existing) {
    try {
      const [created] = await db
        .insert(users)
        .values({
          legacyWebUserId: parsed.data.legacyWebUserId,
          email: parsed.data.email,
          name: relayName,
          avatar: relayAvatar,
          /**
           * Phase B1 transition placeholder.
           * `users.public_key` is currently not-null in relay schema, but web identity bridge
           * does not create or migrate E2EE key material.
           * Real public key upload remains handled by the pre-key/e2ee flow.
           */
          publicKey: `pending:${parsed.data.legacyWebUserId}`,
          updatedAt: now,
        })
        .returning({
          id: users.id,
        });

      return c.json({
        success: true,
        data: {
          relayUserId: created.id,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (
        message.includes('users_legacy_web_user_id_idx') ||
        message.includes('users_email_idx') ||
        message.includes('duplicate key')
      ) {
        return c.json(
          { success: false, error: 'Identity mapping conflict', code: 'IDENTITY_CONFLICT' },
          409
        );
      }
      return c.json(
        { success: false, error: 'Failed to create relay identity', code: 'IDENTITY_CREATE_FAILED' },
        500
      );
    }
  }

  const [updated] = await db
    .update(users)
    .set({
      legacyWebUserId: parsed.data.legacyWebUserId,
      email: parsed.data.email,
      name: relayName,
      avatar: relayAvatar,
      updatedAt: now,
    })
    .where(eq(users.id, existing.id))
    .returning({
      id: users.id,
    });

  return c.json({
    success: true,
    data: {
      relayUserId: updated.id,
    },
  });
});

export default app;
