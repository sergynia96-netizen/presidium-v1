/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq } from 'drizzle-orm';

import { config } from '../config.js';
import { db } from '../db/index.js';
import { subscriptions } from '../db/schema.js';
import { authMiddleware, type AuthUser } from '../middleware/auth.js';

const subscriptionsRouter = new Hono();

function getUser(c: unknown): AuthUser {
  return (c as { get: (key: string) => unknown }).get('user') as AuthUser;
}

const TIERS = [
  {
    tier: 'free',
    price: 0,
    currency: 'RUB',
    features: ['E2EE messaging', '5 contacts', '1 GB storage'],
    limits: { contacts: 5, storage: 1073741824 },
  },
  {
    tier: 'standard',
    price: 99,
    currency: 'RUB',
    features: ['E2EE messaging', '100 contacts', '10 GB storage', 'Marketplace access'],
    limits: { contacts: 100, storage: 10737418240 },
  },
  {
    tier: 'premium',
    price: 299,
    currency: 'RUB',
    features: ['E2EE messaging', 'Unlimited contacts', '100 GB storage', 'Marketplace access', 'Priority support'],
    limits: { contacts: -1, storage: 107374182400 },
  },
];

const createSubscriptionSchema = z.object({
  tier: z.enum(['free', 'standard', 'premium']),
  provider: z.string().max(20),
  externalId: z.string().optional(),
});

subscriptionsRouter.get('/tiers', async (c) => {
  return c.json({ success: true, tiers: TIERS });
});

subscriptionsRouter.get('/current', authMiddleware, async (c) => {
  const user = getUser(c);

  const subscription = await db.query.subscriptions.findFirst({
    where: and(eq(subscriptions.userId, user.id), eq(subscriptions.status, 'active')),
    orderBy: [desc(subscriptions.createdAt)],
  });

  return c.json({ success: true, subscription });
});

subscriptionsRouter.post(
  '/create',
  authMiddleware,
  zValidator('json', createSubscriptionSchema),
  async (c) => {
    const user = getUser(c);
    const body = c.req.valid('json');
    const tierConfig = TIERS.find((t) => t.tier === body.tier);

    if (!tierConfig) {
      return c.json({ success: false, error: 'INVALID_TIER' }, 400);
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    const [sub] = await db
      .insert(subscriptions)
      .values({
        userId: user.id,
        tier: body.tier,
        provider: body.provider,
        externalId: body.externalId,
        amount: tierConfig.price,
        currency: tierConfig.currency,
        status: body.tier === 'free' ? 'active' : 'pending',
        expiresAt,
      })
      .returning();

    return c.json({ success: true, subscription: sub });
  }
);

subscriptionsRouter.post('/cancel', authMiddleware, async (c) => {
  const user = getUser(c);

  const sub = await db.query.subscriptions.findFirst({
    where: and(eq(subscriptions.userId, user.id), eq(subscriptions.status, 'active')),
    orderBy: [desc(subscriptions.createdAt)],
  });

  if (!sub) {
    return c.json({ success: false, error: 'NO_ACTIVE_SUBSCRIPTION' }, 404);
  }

  const [updated] = await db
    .update(subscriptions)
    .set({ autoRenew: false })
    .where(eq(subscriptions.id, sub.id))
    .returning();

  return c.json({ success: true, subscription: updated });
});

subscriptionsRouter.post('/webhook', async (c) => {
  const body = await c.req.json();
  const signature = c.req.header('X-Signature') || c.req.header('x-signature');

  const webhookSecret = (config as any).WEBHOOK_SECRET;
  if (!webhookSecret) {
    return c.json({ success: false, error: 'WEBHOOK_NOT_CONFIGURED' }, 500);
  }

  if (!signature) {
    return c.json({ success: false, error: 'MISSING_SIGNATURE' }, 401);
  }

  const externalId = body.id || body.subscription_id;
  const status = body.status;

  if (externalId && status) {
    await db
      .update(subscriptions)
      .set({ status, externalId: String(externalId) })
      .where(eq(subscriptions.externalId, String(externalId)));
  }

  return c.json({ success: true });
});

export default subscriptionsRouter;
