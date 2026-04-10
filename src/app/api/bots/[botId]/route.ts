import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { rateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';

const paramsSchema = z.object({
  botId: z.string().min(1).max(128),
});

const updateBotSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(500).nullable().optional(),
    prompt: z.string().min(1).max(12000).optional(),
    avatarUrl: z
      .string()
      .max(2048)
      .refine((value) => value.startsWith('/') || /^https?:\/\//i.test(value), {
        message: 'avatarUrl must be a relative (/uploads/...) or absolute http(s) URL',
      })
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

async function requireOwnedBot(userId: string, botId: string) {
  const bot = await db.bot.findUnique({
    where: { id: botId },
  });
  if (!bot) {
    return { bot: null, error: NextResponse.json({ error: 'Bot not found' }, { status: 404 }) };
  }
  if (bot.userId !== userId) {
    return { bot: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { bot, error: null as NextResponse | null };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`bots:get:${session.user.id}`, {
      maxRequests: 90,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many bot fetch requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: 'Invalid bot id' }, { status: 400 });
    }

    const owned = await requireOwnedBot(session.user.id, parsedParams.data.botId);
    if (owned.error) return owned.error;

    return NextResponse.json({ success: true, bot: owned.bot });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`bots:update:${session.user.id}`, {
      maxRequests: 48,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many bot update requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: 'Invalid bot id' }, { status: 400 });
    }

    const parsedBody = updateBotSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    const owned = await requireOwnedBot(session.user.id, parsedParams.data.botId);
    if (owned.error) return owned.error;

    const updated = await db.bot.update({
      where: { id: parsedParams.data.botId },
      data: {
        ...(parsedBody.data.name !== undefined ? { name: parsedBody.data.name.trim() } : {}),
        ...(parsedBody.data.description !== undefined
          ? { description: parsedBody.data.description ? parsedBody.data.description.trim() : null }
          : {}),
        ...(parsedBody.data.prompt !== undefined ? { prompt: parsedBody.data.prompt.trim() } : {}),
        ...(parsedBody.data.avatarUrl !== undefined ? { avatarUrl: parsedBody.data.avatarUrl || null } : {}),
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

    return NextResponse.json({ success: true, bot: updated });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`bots:delete:${session.user.id}`, {
      maxRequests: 24,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many bot delete requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: 'Invalid bot id' }, { status: 400 });
    }

    const owned = await requireOwnedBot(session.user.id, parsedParams.data.botId);
    if (owned.error) return owned.error;

    await db.bot.delete({
      where: { id: parsedParams.data.botId },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
