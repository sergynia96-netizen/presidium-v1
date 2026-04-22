/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * Chat Routes
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../db/index.js';
import { chatMembers, chats, messages, users } from '../db/schema.js';
import { authMiddleware, type AuthContext } from '../middleware/auth.js';
import { apiRateLimit } from '../middleware/rate-limit.js';

const app = new Hono();

const createChatSchema = z.object({
  type: z.enum(['private', 'group', 'channel', 'secret']),
  name: z.string().min(1).max(255).optional(),
  memberIds: z.array(z.string().uuid()).min(1).max(1000),
  isEncrypted: z.boolean().default(true),
});

const addMemberSchema = z.object({
  userId: z.string().uuid(),
});

function getAuth(c: unknown): AuthContext {
  return (c as { get: (key: string) => unknown }).get('auth') as AuthContext;
}

async function getActiveMembership(chatId: string, userId: string) {
  return db.query.chatMembers.findFirst({
    where: and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId), isNull(chatMembers.leftAt)),
  });
}

app.get('/', authMiddleware, apiRateLimit, async (c) => {
  const auth = getAuth(c);

  try {
    const memberships = await db.query.chatMembers.findMany({
      where: and(eq(chatMembers.userId, auth.userId), isNull(chatMembers.leftAt)),
      with: {
        chat: {
          with: {
            members: {
              with: {
                user: {
                  columns: {
                    id: true,
                    name: true,
                    avatar: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [desc(chatMembers.joinedAt)],
    });

    return c.json({
      success: true,
      data: memberships.map((membership) => ({
        id: membership.chat.id,
        type: membership.chat.type,
        name: membership.chat.name,
        avatar: membership.chat.avatar,
        isEncrypted: membership.chat.isEncrypted,
        createdAt: membership.chat.createdAt,
        role: membership.role,
        members: membership.chat.members
          .filter((member) => !member.leftAt)
          .map((member) => ({
            id: member.user.id,
            name: member.user.name,
            avatar: member.user.avatar,
            role: member.role,
          })),
      })),
    });
  } catch (err) {
    console.error('[Chats] List error:', err);
    return c.json(
      {
        success: false,
        error: 'Failed to fetch chats',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

app.post('/', authMiddleware, apiRateLimit, zValidator('json', createChatSchema), async (c) => {
  const auth = getAuth(c);
  const body = c.req.valid('json');

  if (body.type === 'private' && body.memberIds.length !== 1) {
    return c.json(
      {
        success: false,
        error: 'Private chat requires exactly 1 member',
        code: 'VALIDATION_ERROR',
      },
      400
    );
  }

  try {
    const dedupMemberIds = [...new Set(body.memberIds.filter((id) => id !== auth.userId))];
    const candidateUserIds = [auth.userId, ...dedupMemberIds];

    const existingUsers = await db.query.users.findMany({
      where: inArray(users.id, candidateUserIds),
      columns: { id: true },
    });

    if (existingUsers.length !== candidateUserIds.length) {
      return c.json(
        {
          success: false,
          error: 'Some members do not exist',
          code: 'USER_NOT_FOUND',
        },
        404
      );
    }

    const [chat] = await db
      .insert(chats)
      .values({
        type: body.type,
        name: body.type === 'private' ? null : body.name || null,
        isEncrypted: body.isEncrypted,
        createdBy: auth.userId,
      })
      .returning();

    const memberValues = [auth.userId, ...dedupMemberIds].map((userId) => ({
      userId,
      chatId: chat.id,
      role: userId === auth.userId ? ('owner' as const) : ('member' as const),
    }));

    await db.insert(chatMembers).values(memberValues);

    return c.json(
      {
        success: true,
        data: {
          id: chat.id,
          type: chat.type,
          name: chat.name,
          isEncrypted: chat.isEncrypted,
          createdAt: chat.createdAt,
        },
      },
      201
    );
  } catch (err) {
    console.error('[Chats] Create error:', err);
    return c.json(
      {
        success: false,
        error: 'Failed to create chat',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

app.get('/:id/messages', authMiddleware, apiRateLimit, async (c) => {
  const auth = getAuth(c);
  const chatId = c.req.param('id');
  const cursorRaw = c.req.query('cursor');
  const parsedLimit = Number.parseInt(c.req.query('limit') || '20', 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 20;

  try {
    const membership = await getActiveMembership(chatId, auth.userId);
    if (!membership) {
      return c.json(
        {
          success: false,
          error: 'Chat not found or access denied',
          code: 'NOT_FOUND',
        },
        404
      );
    }

    const conditions = [eq(messages.chatId, chatId)];
    if (cursorRaw) {
      const cursorDate = new Date(cursorRaw);
      if (!Number.isNaN(cursorDate.getTime())) {
        conditions.push(lt(messages.createdAt, cursorDate));
      }
    }

    const result = await db.query.messages.findMany({
      where: and(...conditions),
      orderBy: [desc(messages.createdAt)],
      limit: limit + 1,
    });

    const hasMore = result.length > limit;
    const items = hasMore ? result.slice(0, -1) : result;
    items.reverse();

    return c.json({
      success: true,
      data: items.map((row) => ({
        id: row.id,
        senderId: row.senderId,
        encryptedPayload: row.encryptedPayload,
        nonce: row.nonce,
        type: row.type,
        status: row.status,
        replyTo: row.replyTo,
        createdAt: row.createdAt,
      })),
      meta: {
        cursor: hasMore ? items[0]?.createdAt.toISOString() || null : null,
        hasMore,
      },
    });
  } catch (err) {
    console.error('[Chats] Messages error:', err);
    return c.json(
      {
        success: false,
        error: 'Failed to fetch messages',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

app.get('/:id', authMiddleware, apiRateLimit, async (c) => {
  const auth = getAuth(c);
  const chatId = c.req.param('id');

  try {
    const membership = await getActiveMembership(chatId, auth.userId);
    if (!membership) {
      return c.json(
        {
          success: false,
          error: 'Chat not found or access denied',
          code: 'NOT_FOUND',
        },
        404
      );
    }

    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      with: {
        members: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                avatar: true,
                publicKey: true,
              },
            },
          },
        },
      },
    });

    if (!chat) {
      return c.json(
        {
          success: false,
          error: 'Chat not found',
          code: 'NOT_FOUND',
        },
        404
      );
    }

    return c.json({
      success: true,
      data: {
        ...chat,
        members: chat.members
          .filter((member) => !member.leftAt)
          .map((member) => ({
            id: member.user.id,
            name: member.user.name,
            avatar: member.user.avatar,
            publicKey: member.user.publicKey,
            role: member.role,
            joinedAt: member.joinedAt,
          })),
      },
    });
  } catch (err) {
    console.error('[Chats] Details error:', err);
    return c.json(
      {
        success: false,
        error: 'Failed to fetch chat',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

app.post('/:id/members', authMiddleware, apiRateLimit, zValidator('json', addMemberSchema), async (c) => {
  const auth = getAuth(c);
  const chatId = c.req.param('id');
  const { userId } = c.req.valid('json');

  try {
    const membership = await getActiveMembership(chatId, auth.userId);
    if (!membership || !['admin', 'owner'].includes(membership.role)) {
      return c.json(
        {
          success: false,
          error: 'Admin rights required',
          code: 'FORBIDDEN',
        },
        403
      );
    }

    const targetUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true },
    });
    if (!targetUser) {
      return c.json(
        {
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND',
        },
        404
      );
    }

    const existing = await db.query.chatMembers.findFirst({
      where: and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, userId)),
    });

    if (existing && !existing.leftAt) {
      return c.json(
        {
          success: false,
          error: 'Already a member',
          code: 'DUPLICATE_MEMBER',
        },
        409
      );
    }

    if (existing && existing.leftAt) {
      await db
        .update(chatMembers)
        .set({
          leftAt: null,
          joinedAt: new Date(),
        })
        .where(eq(chatMembers.id, existing.id));
    } else {
      await db.insert(chatMembers).values({
        chatId,
        userId,
        role: 'member',
      });
    }

    return c.json(
      {
        success: true,
        data: { added: true },
      },
      201
    );
  } catch (err) {
    console.error('[Chats] Add member error:', err);
    return c.json(
      {
        success: false,
        error: 'Failed to add member',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

app.delete('/:id/members/:userId', authMiddleware, apiRateLimit, async (c) => {
  const auth = getAuth(c);
  const chatId = c.req.param('id');
  const targetUserId = c.req.param('userId');

  try {
    const isSelfRemoval = targetUserId === auth.userId;
    if (!isSelfRemoval) {
      const actorMembership = await getActiveMembership(chatId, auth.userId);
      if (!actorMembership || !['admin', 'owner'].includes(actorMembership.role)) {
        return c.json(
          {
            success: false,
            error: 'Admin rights required',
            code: 'FORBIDDEN',
          },
          403
        );
      }
    }

    await db
      .update(chatMembers)
      .set({ leftAt: new Date() })
      .where(and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, targetUserId), isNull(chatMembers.leftAt)));

    return c.json({
      success: true,
      data: { removed: true },
    });
  } catch (err) {
    console.error('[Chats] Remove member error:', err);
    return c.json(
      {
        success: false,
        error: 'Failed to remove member',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

export default app;
