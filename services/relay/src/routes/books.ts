/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '../db/index.js';
import { books } from '../db/schema.js';
import { authMiddleware, type AuthUser } from '../middleware/auth.js';

const booksRouter = new Hono();

function getUser(c: unknown): AuthUser {
  return (c as { get: (key: string) => unknown }).get('user') as AuthUser;
}

const createBookSchema = z.object({
  title: z.string().min(1).max(255),
  author: z.string().max(255).optional(),
  description: z.string().max(10000).optional(),
  coverUrl: z.string().optional(),
  fileUrl: z.string().min(1),
  e2eKey: z.string().optional(),
  price: z.number().int().min(0).default(0),
  category: z.string().max(50).optional(),
  format: z.string().max(10).default('pdf'),
});

const updateBookSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  author: z.string().max(255).optional(),
  description: z.string().max(10000).optional(),
  coverUrl: z.string().optional(),
  price: z.number().int().min(0).optional(),
  category: z.string().max(50).optional(),
});

booksRouter.post(
  '/',
  authMiddleware,
  zValidator('json', createBookSchema),
  async (c) => {
    const user = getUser(c);
    const body = c.req.valid('json');

    const [book] = await db
      .insert(books)
      .values({
        title: body.title,
        author: body.author,
        description: body.description,
        coverUrl: body.coverUrl,
        fileUrl: body.fileUrl,
        e2eKey: body.e2eKey,
        price: body.price,
        category: body.category,
        format: body.format,
        uploaderId: user.id,
      })
      .returning();

    return c.json({ success: true, book });
  }
);

booksRouter.get('/', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') || '20'), 50);
  const offset = Number(c.req.query('offset') || '0');
  const category = c.req.query('category');

  const conditions: any[] = [];
  if (category) {
    conditions.push(eq(books.category, category));
  }

  const items = await db.query.books.findMany({
    where: conditions.length > 0 ? and(...conditions) : undefined,
    orderBy: [desc(books.createdAt)],
    limit,
    offset,
  });

  return c.json({ success: true, items });
});

booksRouter.get('/:id', async (c) => {
  const id = c.req.param('id');

  const book = await db.query.books.findFirst({
    where: eq(books.id, id),
  });

  if (!book) {
    return c.json({ success: false, error: 'BOOK_NOT_FOUND' }, 404);
  }

  return c.json({ success: true, book });
});

booksRouter.put(
  '/:id',
  authMiddleware,
  zValidator('json', updateBookSchema),
  async (c) => {
    const user = getUser(c);
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = await db.query.books.findFirst({
      where: eq(books.id, id),
    });

    if (!existing) {
      return c.json({ success: false, error: 'BOOK_NOT_FOUND' }, 404);
    }

    if (existing.uploaderId !== user.id) {
      return c.json({ success: false, error: 'FORBIDDEN' }, 403);
    }

    const [updated] = await db
      .update(books)
      .set(body)
      .where(eq(books.id, id))
      .returning();

    return c.json({ success: true, book: updated });
  }
);

booksRouter.delete('/:id', authMiddleware, async (c) => {
  const user = getUser(c);
  const id = c.req.param('id');

  const existing = await db.query.books.findFirst({
    where: eq(books.id, id),
  });

  if (!existing) {
    return c.json({ success: false, error: 'BOOK_NOT_FOUND' }, 404);
  }

  if (existing.uploaderId !== user.id) {
    return c.json({ success: false, error: 'FORBIDDEN' }, 403);
  }

  await db.delete(books).where(eq(books.id, id));

  return c.json({ success: true });
});

booksRouter.post('/:id/download', authMiddleware, async (c) => {
  const user = getUser(c);
  const id = c.req.param('id');

  const book = await db.query.books.findFirst({
    where: eq(books.id, id),
  });

  if (!book) {
    return c.json({ success: false, error: 'BOOK_NOT_FOUND' }, 404);
  }

  await db
    .update(books)
    .set({ downloads: sql`${books.downloads} + 1` })
    .where(eq(books.id, id));

  return c.json({ success: true, book: { ...book, downloads: book.downloads + 1 } });
});

export default booksRouter;
