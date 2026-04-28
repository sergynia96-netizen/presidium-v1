/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, count, desc, eq, ilike, isNull, sql } from 'drizzle-orm';

import { db } from '../db/index.js';
import { moderationReports, users, messages, chats } from '../db/schema.js';
import { authMiddleware, type AuthUser } from '../middleware/auth.js';

const adminRouter = new Hono();

function getUser(c: unknown): AuthUser {
  return (c as { get: (key: string) => unknown }).get('user') as AuthUser;
}

const strikesSchema = z.object({
  strikes: z.number().int().min(0).max(100),
  reason: z.string().max(500).optional(),
});

const banSchema = z.object({
  banned: z.boolean(),
  reason: z.string().max(500).optional(),
});

const reviewSchema = z.object({
  action: z.enum(['none', 'warn', 'strike', 'ban', 'dismiss']),
  note: z.string().max(1000).optional(),
});

adminRouter.get('/stats', authMiddleware, async (c) => {
  const user = getUser(c);

  const [userCount] = await db.select({ count: count() }).from(users).where(isNull(users.deletedAt));
  const [messageCount] = await db.select({ count: count() }).from(messages);
  const [chatCount] = await db.select({ count: count() }).from(chats).where(isNull(chats.deletedAt));
  const [activeChats] = await db.select({ count: count() }).from(chats).where(and(isNull(chats.deletedAt), eq(chats.type, 'private')));
  const [reportCount] = await db.select({ count: count() }).from(moderationReports).where(isNull(moderationReports.reviewedBy));
  const [bannedCount] = await db.select({ count: count() }).from(users).where(eq(users.status, 'banned'));

  return c.json({
    success: true,
    stats: {
      totalUsers: userCount.count,
      totalMessages: messageCount.count,
      totalChats: chatCount.count,
      activeChats: activeChats.count,
      pendingReports: reportCount.count,
      bannedUsers: bannedCount.count,
    },
  });
});

adminRouter.get('/users', authMiddleware, async (c) => {
  const user = getUser(c);
  const limit = Math.min(Number(c.req.query('limit') || '20'), 100);
  const offset = Number(c.req.query('offset') || '0');
  const search = c.req.query('search');
  const status = c.req.query('status');

  const conditions: any[] = [isNull(users.deletedAt)];
  if (search) {
    conditions.push(ilike(users.name, '%' + search + '%'));
  }
  if (status) {
    conditions.push(eq(users.status, status));
  }

  const items = await db.query.users.findMany({
    where: and(...conditions),
    orderBy: [desc(users.createdAt)],
    limit,
    offset,
    columns: {
      id: true,
      name: true,
      email: true,
      avatar: true,
      status: true,
      strikes: true,
      subscriptionTier: true,
      privacyTier: true,
      lastSeenAt: true,
      createdAt: true,
    },
  });

  return c.json({ success: true, users: items });
});

adminRouter.put(
  '/users/:id/strikes',
  authMiddleware,
  zValidator('json', strikesSchema),
  async (c) => {
    const user = getUser(c);
    const targetId = c.req.param('id');
    const body = c.req.valid('json');

    const target = await db.query.users.findFirst({
      where: eq(users.id, targetId),
      columns: { id: true },
    });

    if (!target) {
      return c.json({ success: false, error: 'USER_NOT_FOUND' }, 404);
    }

    const [updated] = await db
      .update(users)
      .set({ strikes: body.strikes, updatedAt: new Date() })
      .where(eq(users.id, targetId))
      .returning({ id: users.id, strikes: users.strikes });

    return c.json({ success: true, user: updated });
  }
);

adminRouter.put(
  '/users/:id/ban',
  authMiddleware,
  zValidator('json', banSchema),
  async (c) => {
    const user = getUser(c);
    const targetId = c.req.param('id');
    const body = c.req.valid('json');

    const target = await db.query.users.findFirst({
      where: eq(users.id, targetId),
      columns: { id: true },
    });

    if (!target) {
      return c.json({ success: false, error: 'USER_NOT_FOUND' }, 404);
    }

    const [updated] = await db
      .update(users)
      .set({
        status: body.banned ? 'banned' : 'active',
        updatedAt: new Date(),
      })
      .where(eq(users.id, targetId))
      .returning({ id: users.id, status: users.status });

    return c.json({ success: true, user: updated });
  }
);

adminRouter.get('/reports', authMiddleware, async (c) => {
  const user = getUser(c);
  const limit = Math.min(Number(c.req.query('limit') || '20'), 100);
  const offset = Number(c.req.query('offset') || '0');

  const reports = await db.query.moderationReports.findMany({
    orderBy: [desc(moderationReports.createdAt)],
    limit,
    offset,
  });

  return c.json({ success: true, reports });
});

adminRouter.put(
  '/reports/:id/review',
  authMiddleware,
  zValidator('json', reviewSchema),
  async (c) => {
    const user = getUser(c);
    const reportId = c.req.param('id');
    const body = c.req.valid('json');

    const report = await db.query.moderationReports.findFirst({
      where: eq(moderationReports.id, reportId),
    });

    if (!report) {
      return c.json({ success: false, error: 'REPORT_NOT_FOUND' }, 404);
    }

    const [updated] = await db
      .update(moderationReports)
      .set({
        action: body.action,
        reviewedBy: user.id,
      })
      .where(eq(moderationReports.id, reportId))
      .returning();

    if (body.action === 'ban' && report.senderId) {
      await db
        .update(users)
        .set({ status: 'banned', updatedAt: new Date() })
        .where(eq(users.id, report.senderId));
    }

    return c.json({ success: true, report: updated });
  }
);

export default adminRouter;
