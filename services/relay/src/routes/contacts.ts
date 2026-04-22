/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
import { Hono } from 'hono';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '../db/index.js';
import { contacts, users } from '../db/schema.js';
import { authMiddleware, type AuthContext } from '../middleware/auth.js';

const app = new Hono();

function getAuth(c: unknown): AuthContext {
  return (c as { get: (key: string) => unknown }).get('auth') as AuthContext;
}

app.get('/', authMiddleware, async (c) => {
  const auth = getAuth(c);

  const list = await db.query.contacts.findMany({
    where: eq(contacts.userId, auth.userId),
  });

  const ids = list.map((item) => item.contactId);
  const userRows =
    ids.length > 0
      ? await db.query.users.findMany({
          where: inArray(users.id, ids),
          columns: { id: true, name: true, avatar: true, publicKey: true },
        })
      : [];
  const userMap = new Map(userRows.map((row) => [row.id, row]));

  return c.json({
    contacts: list.map((item) => {
      const profile = userMap.get(item.contactId);
      return {
        id: item.contactId,
        relationId: item.id,
        contactId: item.contactId,
        name: item.name || profile?.name || 'Unknown',
        avatar: profile?.avatar || null,
        publicKey: profile?.publicKey || '',
        category: item.category,
        privacyTags: item.privacyTags || [],
        isFavorite: item.isFavorite,
        isBlocked: item.isBlocked,
        createdAt: item.createdAt,
      };
    }),
  });
});

app.put('/close-friends', authMiddleware, async (c) => {
  const auth = getAuth(c);
  const body = (await c.req.json()) as { closeFriendIds?: string[] };

  await db
    .update(contacts)
    .set({ privacyTags: sql`array_remove(${contacts.privacyTags}, 'close-friend')` })
    .where(eq(contacts.userId, auth.userId));

  if (body.closeFriendIds && body.closeFriendIds.length > 0) {
    await db
      .update(contacts)
      .set({
        privacyTags:
          sql`array_append(coalesce(${contacts.privacyTags}, ARRAY[]::text[]), 'close-friend')`,
      })
      .where(
        and(
          eq(contacts.userId, auth.userId),
          inArray(contacts.contactId, body.closeFriendIds)
        )
      );
  }

  return c.json({ success: true });
});

export default app;
