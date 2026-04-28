import { Hono } from 'hono';
import { and, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../db/index.js';
import { chatMembers, chats, users } from '../db/schema.js';

const app = new Hono();

const syncWebUserSchema = z.object({
  legacyWebUserId: z.string().min(1),
  email: z.string().email(),
  name: z.string().trim().min(1).max(255).optional(),
  avatar: z.string().trim().max(4096).optional(),
});

const upsertPrivateChatSchema = z
  .object({
    requesterRelayUserId: z.string().uuid(),
    recipientRelayUserId: z.string().uuid().optional(),
    recipientLegacyWebUserId: z.string().min(1).optional(),
    recipientEmail: z.string().email().optional(),
    recipientName: z.string().trim().min(1).max(255).optional(),
    recipientAvatar: z.string().trim().max(4096).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.recipientRelayUserId && !value.recipientLegacyWebUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipientLegacyWebUserId'],
        message: 'Recipient identifier is required',
      });
    }
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

function buildPrivatePairKey(userA: string, userB: string): string {
  return [userA, userB].sort().join(':');
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

app.post('/chats/private/upsert', async (c) => {
  const authHeader = c.req.header('authorization') || c.req.header('Authorization');
  if (!hasValidInternalAuthHeader(authHeader)) {
    return c.json({ success: false, error: 'Unauthorized', code: 'IDENTITY_AUTH_INVALID' }, 401);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = upsertPrivateChatSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: 'Invalid private chat payload',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      },
      400
    );
  }

  const payload = parsed.data;

  if (payload.requesterRelayUserId === payload.recipientRelayUserId) {
    return c.json(
      {
        success: false,
        error: 'Cannot create private chat with self',
        code: 'VALIDATION_ERROR',
      },
      400
    );
  }

  const requester = await db.query.users.findFirst({
    where: eq(users.id, payload.requesterRelayUserId),
    columns: { id: true },
  });

  if (!requester) {
    return c.json(
      { success: false, error: 'Requester identity not found', code: 'REQUESTER_NOT_FOUND' },
      404
    );
  }

  let recipientRelayUserId = payload.recipientRelayUserId || null;

  if (!recipientRelayUserId && payload.recipientLegacyWebUserId) {
    const recipient = await db.query.users.findFirst({
      where: eq(users.legacyWebUserId, payload.recipientLegacyWebUserId),
      columns: { id: true },
    });

    if (recipient) {
      recipientRelayUserId = recipient.id;
    }
  }

  if (!recipientRelayUserId && payload.recipientLegacyWebUserId && payload.recipientEmail) {
    const relayName = payload.recipientName?.trim() || payload.recipientEmail;
    const relayAvatar = payload.recipientAvatar?.trim() || '';
    const now = new Date();

    try {
      const [created] = await db
        .insert(users)
        .values({
          legacyWebUserId: payload.recipientLegacyWebUserId,
          email: payload.recipientEmail,
          name: relayName,
          avatar: relayAvatar,
          publicKey: `pending:${payload.recipientLegacyWebUserId}`,
          updatedAt: now,
        })
        .returning({ id: users.id });
      recipientRelayUserId = created.id;
    } catch {
      const retry = await db.query.users.findFirst({
        where: eq(users.legacyWebUserId, payload.recipientLegacyWebUserId),
        columns: { id: true },
      });
      recipientRelayUserId = retry?.id || null;
    }
  }

  if (!recipientRelayUserId) {
    return c.json(
      { success: false, error: 'Recipient identity not found', code: 'RECIPIENT_NOT_FOUND' },
      404
    );
  }

  if (payload.requesterRelayUserId === recipientRelayUserId) {
    return c.json(
      {
        success: false,
        error: 'Cannot create private chat with self',
        code: 'VALIDATION_ERROR',
      },
      400
    );
  }

  const pairKey = buildPrivatePairKey(payload.requesterRelayUserId, recipientRelayUserId);

  try {
    const result = await db.transaction(async (tx) => {
      const existing = await tx.query.chats.findFirst({
        where: eq(chats.privatePairKey, pairKey),
        columns: {
          id: true,
          type: true,
          isEncrypted: true,
          createdAt: true,
        },
      });

      if (existing) {
        await tx
          .insert(chatMembers)
          .values([
            { chatId: existing.id, userId: payload.requesterRelayUserId, role: 'owner' },
            { chatId: existing.id, userId: recipientRelayUserId, role: 'member' },
          ])
          .onConflictDoNothing();

        return { chat: existing, reused: true };
      }

      const [chat] = await tx
        .insert(chats)
        .values({
          type: 'private',
          isEncrypted: true,
          createdBy: payload.requesterRelayUserId,
          privatePairKey: pairKey,
        })
        .returning({
          id: chats.id,
          type: chats.type,
          isEncrypted: chats.isEncrypted,
          createdAt: chats.createdAt,
        });

      await tx.insert(chatMembers).values([
        { chatId: chat.id, userId: payload.requesterRelayUserId, role: 'owner' },
        { chatId: chat.id, userId: recipientRelayUserId, role: 'member' },
      ]);

      return { chat, reused: false };
    });

    return c.json({
      success: true,
      data: {
        id: result.chat.id,
        type: result.chat.type,
        isEncrypted: result.chat.isEncrypted,
        createdAt: result.chat.createdAt,
        memberIds: [payload.requesterRelayUserId, recipientRelayUserId],
        mode: 'canonical_postgres',
        reused: result.reused,
      },
    });
  } catch {
    return c.json(
      {
        success: false,
        error: 'Failed to upsert private chat',
        code: 'PRIVATE_CHAT_CREATE_FAILED',
      },
      500
    );
  }
});

export default app;
