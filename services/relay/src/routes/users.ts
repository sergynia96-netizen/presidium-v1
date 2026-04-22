/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * User Routes
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, eq, ilike, inArray, or } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../db/index.js';
import { contacts, users } from '../db/schema.js';
import { authMiddleware, type AuthContext } from '../middleware/auth.js';
import { apiRateLimit } from '../middleware/rate-limit.js';

const app = new Hono();

const updateProfileSchema = z
  .object({
    name: z.string().min(2).max(100).optional(),
    avatar: z.string().url().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

const addContactSchema = z.object({
  contactId: z.string().uuid(),
  name: z.string().max(100).optional(),
  category: z.enum(['contacts', 'close-friends', 'close_friends']).default('contacts'),
});

function getAuth(c: unknown): AuthContext {
  return (c as { get: (key: string) => unknown }).get('auth') as AuthContext;
}

app.get('/me/contacts', authMiddleware, apiRateLimit, async (c) => {
  const auth = getAuth(c);

  try {
    const contactRows = await db.query.contacts.findMany({
      where: eq(contacts.userId, auth.userId),
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit: 1000,
    });

    const contactIds = contactRows.map((row) => row.contactId);
    const userRows =
      contactIds.length > 0
        ? await db.query.users.findMany({
            where: inArray(users.id, contactIds),
            columns: {
              id: true,
              name: true,
              avatar: true,
              publicKey: true,
              presenceStatus: true,
              lastSeenAt: true,
            },
          })
        : [];

    const userMap = new Map(userRows.map((row) => [row.id, row]));

    return c.json({
      success: true,
      data: contactRows.map((row) => ({
        id: row.id,
        contactId: row.contactId,
        name: row.name,
        isFavorite: row.isFavorite,
        isBlocked: row.isBlocked,
        category: row.category,
        contact: userMap.get(row.contactId) || null,
        createdAt: row.createdAt,
      })),
    });
  } catch (err) {
    console.error('[Users] Contacts error:', err);
    return c.json(
      {
        success: false,
        error: 'Failed to fetch contacts',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

app.post(
  '/me/contacts',
  authMiddleware,
  apiRateLimit,
  zValidator('json', addContactSchema),
  async (c) => {
    const auth = getAuth(c);
    const body = c.req.valid('json');

    if (body.contactId === auth.userId) {
      return c.json(
        {
          success: false,
          error: 'Cannot add yourself',
          code: 'SELF_CONTACT',
        },
        400
      );
    }

    try {
      const target = await db.query.users.findFirst({
        where: eq(users.id, body.contactId),
        columns: { id: true },
      });

      if (!target) {
        return c.json(
          {
            success: false,
            error: 'User not found',
            code: 'USER_NOT_FOUND',
          },
          404
        );
      }

      const existing = await db.query.contacts.findFirst({
        where: and(eq(contacts.userId, auth.userId), eq(contacts.contactId, body.contactId)),
        columns: { id: true },
      });

      if (existing) {
        return c.json(
          {
            success: false,
            error: 'Already in contacts',
            code: 'DUPLICATE_CONTACT',
          },
          409
        );
      }

      const [created] = await db
        .insert(contacts)
        .values({
          userId: auth.userId,
          contactId: body.contactId,
          name: body.name,
          category: body.category,
        })
        .returning();

      return c.json(
        {
          success: true,
          data: created,
        },
        201
      );
    } catch (err) {
      console.error('[Users] Add contact error:', err);
      return c.json(
        {
          success: false,
          error: 'Failed to add contact',
          code: 'INTERNAL_ERROR',
        },
        500
      );
    }
  }
);

app.delete('/me/contacts/:contactId', authMiddleware, apiRateLimit, async (c) => {
  const auth = getAuth(c);
  const contactId = c.req.param('contactId');

  try {
    await db
      .delete(contacts)
      .where(and(eq(contacts.userId, auth.userId), eq(contacts.contactId, contactId)));

    return c.json({
      success: true,
      data: { deleted: true },
    });
  } catch (err) {
    console.error('[Users] Delete contact error:', err);
    return c.json(
      {
        success: false,
        error: 'Failed to remove contact',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

app.patch('/me', authMiddleware, apiRateLimit, zValidator('json', updateProfileSchema), async (c) => {
  const auth = getAuth(c);
  const body = c.req.valid('json');

  try {
    const [updated] = await db
      .update(users)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(users.id, auth.userId))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        updatedAt: users.updatedAt,
      });

    return c.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    console.error('[Users] Update error:', err);
    return c.json(
      {
        success: false,
        error: 'Update failed',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

app.get('/search', authMiddleware, apiRateLimit, async (c) => {
  const auth = getAuth(c);
  const q = (c.req.query('q') || '').trim();

  if (q.length < 2) {
    return c.json(
      {
        success: false,
        error: 'Query must be at least 2 characters',
        code: 'VALIDATION_ERROR',
      },
      400
    );
  }

  try {
    const searchPattern = `%${q}%`;
    const rows = await db.query.users.findMany({
      where: or(ilike(users.name, searchPattern), ilike(users.email, searchPattern)),
      columns: {
        id: true,
        name: true,
        avatar: true,
        publicKey: true,
        presenceStatus: true,
        lastSeenAt: true,
      },
      limit: 20,
    });

    const filtered = rows.filter((row) => row.id !== auth.userId);

    return c.json({
      success: true,
      data: filtered,
      meta: { total: filtered.length },
    });
  } catch (err) {
    console.error('[Users] Search error:', err);
    return c.json(
      {
        success: false,
        error: 'Search failed',
        code: 'INTERNAL_ERROR',
      },
      500
    );
  }
});

app.get('/:id', authMiddleware, apiRateLimit, async (c) => {
  const userId = c.req.param('id');

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
        name: true,
        avatar: true,
        publicKey: true,
        presenceStatus: true,
        lastSeenAt: true,
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
    console.error('[Users] Profile error:', err);
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
