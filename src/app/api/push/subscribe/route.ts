import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1).max(2048),
    auth: z.string().min(1).max(2048),
  }),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`push:subscribe:${session.user.id}`, {
      maxRequests: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many subscribe requests' }, { status: 429 });
    }

    const parse = pushSubscriptionSchema.safeParse(await request.json());
    if (!parse.success) {
      return NextResponse.json(
        { error: 'Invalid subscription payload', details: parse.error.flatten() },
        { status: 400 },
      );
    }

    const payload = parse.data;
    const userAgent = request.headers.get('user-agent')?.slice(0, 512) || null;

    await db.pushSubscription.upsert({
      where: { endpoint: payload.endpoint },
      create: {
        userId: session.user.id,
        endpoint: payload.endpoint,
        p256dh: payload.keys.p256dh,
        auth: payload.keys.auth,
        expirationTime:
          typeof payload.expirationTime === 'number'
            ? String(payload.expirationTime)
            : null,
        userAgent,
      },
      update: {
        userId: session.user.id,
        p256dh: payload.keys.p256dh,
        auth: payload.keys.auth,
        expirationTime:
          typeof payload.expirationTime === 'number'
            ? String(payload.expirationTime)
            : null,
        userAgent,
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to subscribe push notifications' }, { status: 500 });
  }
}
