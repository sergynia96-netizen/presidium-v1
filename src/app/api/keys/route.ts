import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import {
  generateApiKeyToken,
  hashApiKey,
  parsePermissions,
  serializePermissions,
} from '@/lib/api-key-auth';

const createApiKeySchema = z.object({
  name: z.string().min(1).max(120),
  permissions: z.array(z.string().min(1).max(120)).max(30).optional(),
  expiresAt: z.string().datetime().optional(),
});

export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`api-keys:list:${session.user.id}`, {
      maxRequests: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many API key list requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const keys = await db.apiKey.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        permissions: true,
        lastUsed: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      keys: keys.map((key) => ({
        id: key.id,
        name: key.name,
        permissions: parsePermissions(key.permissions),
        lastUsed: key.lastUsed,
        expiresAt: key.expiresAt,
        createdAt: key.createdAt,
      })),
    });
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

    const limit = rateLimit(`api-keys:create:${session.user.id}`, {
      maxRequests: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many API key create requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const parsed = createApiKeySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const token = generateApiKeyToken();
    const keyHash = hashApiKey(token);

    const expiresAt =
      parsed.data.expiresAt && parsed.data.expiresAt.trim()
        ? new Date(parsed.data.expiresAt)
        : null;

    const created = await db.apiKey.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name.trim(),
        key: keyHash,
        permissions: serializePermissions(parsed.data.permissions),
        expiresAt,
      },
      select: {
        id: true,
        name: true,
        permissions: true,
        lastUsed: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        key: {
          id: created.id,
          name: created.name,
          permissions: parsePermissions(created.permissions),
          lastUsed: created.lastUsed,
          expiresAt: created.expiresAt,
          createdAt: created.createdAt,
        },
        apiKey: token, // plaintext is returned only once
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
