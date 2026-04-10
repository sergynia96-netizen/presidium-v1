import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { rateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';

const createBotSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  prompt: z.string().min(1).max(12000),
  avatarUrl: z
    .string()
    .max(2048)
    .refine((value) => value.startsWith('/') || /^https?:\/\//i.test(value), {
      message: 'avatarUrl must be a relative (/uploads/...) or absolute http(s) URL',
    })
    .optional(),
});

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`bots:list:${session.user.id}`, {
      maxRequests: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many bot list requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const bots = await db.bot.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        userId: true,
        name: true,
        description: true,
        prompt: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, bots });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`bots:create:${session.user.id}`, {
      maxRequests: 24,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many bot create requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const parsed = createBotSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const bot = await db.bot.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        prompt: parsed.data.prompt.trim(),
        avatarUrl: parsed.data.avatarUrl || null,
      },
      select: {
        id: true,
        userId: true,
        name: true,
        description: true,
        prompt: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, bot }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
