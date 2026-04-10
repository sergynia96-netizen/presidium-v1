import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`push:unsubscribe:${session.user.id}`, {
      maxRequests: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many unsubscribe requests' }, { status: 429 });
    }

    const parse = unsubscribeSchema.safeParse(await request.json());
    if (!parse.success) {
      return NextResponse.json(
        { error: 'Invalid unsubscribe payload', details: parse.error.flatten() },
        { status: 400 },
      );
    }

    await db.pushSubscription.deleteMany({
      where: {
        userId: session.user.id,
        endpoint: parse.data.endpoint,
      },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to unsubscribe push notifications' }, { status: 500 });
  }
}
