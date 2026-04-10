import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

const paramsSchema = z.object({
  keyId: z.string().min(1).max(128),
});

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ keyId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`api-keys:delete:${session.user.id}`, {
      maxRequests: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many API key delete requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: 'Invalid key id' }, { status: 400 });
    }

    const existing = await db.apiKey.findUnique({
      where: { id: parsedParams.data.keyId },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 });
    }

    if (existing.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.apiKey.delete({
      where: { id: existing.id },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
