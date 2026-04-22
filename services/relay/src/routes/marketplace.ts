/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { db } from '../db/index.js';
import { marketplaceItems } from '../db/schema.js';
import { authMiddleware, type AuthUser } from '../middleware/auth.js';

const marketplaceRouter = new Hono();

function getUser(c: unknown): AuthUser {
  return (c as { get: (key: string) => unknown }).get('user') as AuthUser;
}

const createItemSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  price: z.number().int().min(0).default(0),
  category: z.string().max(50),
  images: z.array(z.string()).max(10).optional(),
  location: z.string().max(100).optional(),
});

const updateItemSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  price: z.number().int().min(0).optional(),
  category: z.string().max(50).optional(),
  images: z.array(z.string()).max(10).optional(),
  location: z.string().max(100).optional(),
  status: z.string().max(20).optional(),
});

marketplaceRouter.post(
  '/',
  authMiddleware,
  zValidator('json', createItemSchema),
  async (c) => {
    const user = getUser(c);
    const body = c.req.valid('json');

    const [item] = await db
      .insert(marketplaceItems)
      .values({
        sellerId: user.id,
        title: body.title,
        description: body.description,
        price: body.price,
        category: body.category,
        images: body.images || [],
        location: body.location,
      })
      .returning();

    return c.json({ success: true, item });
  }
);

marketplaceRouter.get('/', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') || '20'), 50);
  const offset = Number(c.req.query('offset') || '0');
  const category = c.req.query('category');
  const status = c.req.query('status') || 'active';

  const conditions: any[] = [
    eq(marketplaceItems.status, status),
    isNull(marketplaceItems.deletedAt),
  ];

  if (category) {
    conditions.push(eq(marketplaceItems.category, category));
  }

  const items = await db.query.marketplaceItems.findMany({
    where: and(...conditions),
    orderBy: [desc(marketplaceItems.createdAt)],
    limit,
    offset,
    with: {
      seller: {
        columns: { id: true, name: true, avatar: true },
      },
    },
  });

  return c.json({ success: true, items });
});

marketplaceRouter.get('/:id', async (c) => {
  const id = c.req.param('id');

  const item = await db.query.marketplaceItems.findFirst({
    where: and(eq(marketplaceItems.id, id), isNull(marketplaceItems.deletedAt)),
    with: {
      seller: {
        columns: { id: true, name: true, avatar: true },
      },
    },
  });

  if (!item) {
    return c.json({ success: false, error: 'ITEM_NOT_FOUND' }, 404);
  }

  await db
    .update(marketplaceItems)
    .set({ views: sql`${marketplaceItems.views} + 1` })
    .where(eq(marketplaceItems.id, id));

  return c.json({ success: true, item: { ...item, views: item.views + 1 } });
});

marketplaceRouter.put(
  '/:id',
  authMiddleware,
  zValidator('json', updateItemSchema),
  async (c) => {
    const user = getUser(c);
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = await db.query.marketplaceItems.findFirst({
      where: and(eq(marketplaceItems.id, id), isNull(marketplaceItems.deletedAt)),
    });

    if (!existing) {
      return c.json({ success: false, error: 'ITEM_NOT_FOUND' }, 404);
    }

    if (existing.sellerId !== user.id) {
      return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    }

    const [updated] = await db
      .update(marketplaceItems)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(marketplaceItems.id, id))
      .returning();

    return c.json({ success: true, item: updated });
  }
);

marketplaceRouter.delete('/:id', authMiddleware, async (c) => {
  const user = getUser(c);
  const id = c.req.param('id');

  const existing = await db.query.marketplaceItems.findFirst({
    where: and(eq(marketplaceItems.id, id), isNull(marketplaceItems.deletedAt)),
  });

  if (!existing) {
    return c.json({ success: false, error: 'ITEM_NOT_FOUND' }, 404);
  }

  if (existing.sellerId !== user.id) {
    return c.json({ success: false, error: 'FORBIDDEN' }, 403);
  }

  await db
    .update(marketplaceItems)
    .set({ deletedAt: new Date(), status: 'removed' })
    .where(eq(marketplaceItems.id, id));

  return c.json({ success: true });
});

marketplaceRouter.post('/:id/contact', authMiddleware, async (c) => {
  const user = getUser(c);
  const id = c.req.param('id');

  const item = await db.query.marketplaceItems.findFirst({
    where: and(eq(marketplaceItems.id, id), isNull(marketplaceItems.deletedAt)),
  });

  if (!item) {
    return c.json({ success: false, error: 'ITEM_NOT_FOUND' }, 404);
  }

  if (item.sellerId === user.id) {
    return c.json({ success: false, error: 'CANNOT_CONTACT_SELF' }, 400);
  }

  await db
    .update(marketplaceItems)
    .set({ contacts: sql`${marketplaceItems.contacts} + 1` })
    .where(eq(marketplaceItems.id, id));

  return c.json({ success: true });
});

export default marketplaceRouter;
