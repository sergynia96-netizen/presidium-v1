import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { STORY_PRIVACY, STORY_SOURCE_TYPES, STORY_TYPES, cleanupExpiredStories, mapStoryForClient } from '@/lib/stories-server';

const createStorySchema = z.object({
  sourceId: z.string().min(1).max(128),
  sourceType: z.enum(STORY_SOURCE_TYPES),
  type: z.enum(STORY_TYPES),
  content: z.string().max(500).optional().default(''),
  mediaUrl: z.string().min(1).max(2048).optional(),
  mediaMimeType: z.string().min(1).max(255).optional(),
  mediaName: z.string().min(1).max(255).optional(),
  mediaSize: z.number().int().min(0).max(100 * 1024 * 1024).optional(),
  e2eMedia: z
    .object({
      key: z.string().min(1).max(2048),
      iv: z.string().min(1).max(1024),
      tag: z.string().min(1).max(1024),
    })
    .optional(),
  thumbnail: z.string().min(1).max(2_000_000).optional(),
  privacy: z.enum(STORY_PRIVACY).default('contacts'),
  allowedUserIds: z.array(z.string().min(1).max(128)).optional(),
});

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`stories:create:${session.user.id}`, {
      maxRequests: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many story create requests' }, { status: 429 });
    }

    await cleanupExpiredStories();

    const parse = createStorySchema.safeParse(await request.json());
    if (!parse.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parse.error.flatten() },
        { status: 400 },
      );
    }

    const payload = parse.data;

    if (payload.sourceType === 'user' && payload.sourceId !== session.user.id) {
      return NextResponse.json({ error: 'sourceId must match current user for user stories' }, { status: 403 });
    }

    if (!payload.content.trim() && !payload.mediaUrl) {
      return NextResponse.json({ error: 'Story must contain text or media' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true, avatar: true },
    });

    const now = Date.now();
    const created = await db.story.create({
      data: {
        sourceId: payload.sourceId,
        sourceType: payload.sourceType,
        creatorId: session.user.id,
        creatorName: user?.name || session.user.name || session.user.email || 'Unknown',
        creatorAvatar: user?.avatar || null,
        type: payload.type,
        content: payload.content.trim(),
        mediaUrl: payload.mediaUrl || null,
        mediaMimeType: payload.mediaMimeType || null,
        mediaName: payload.mediaName || null,
        mediaSize: payload.mediaSize ?? null,
        e2eKey: payload.e2eMedia?.key || null,
        e2eIv: payload.e2eMedia?.iv || null,
        e2eTag: payload.e2eMedia?.tag || null,
        thumbnail: payload.thumbnail || null,
        privacy: payload.privacy,
        allowedUserIds: payload.allowedUserIds ? JSON.stringify(payload.allowedUserIds) : null,
        createdAt: new Date(now),
        expiresAt: new Date(now + STORY_TTL_MS),
      },
      select: {
        id: true,
        sourceId: true,
        sourceType: true,
        creatorId: true,
        creatorName: true,
        creatorAvatar: true,
        type: true,
        content: true,
        mediaUrl: true,
        mediaMimeType: true,
        mediaName: true,
        mediaSize: true,
        e2eKey: true,
        e2eIv: true,
        e2eTag: true,
        thumbnail: true,
        createdAt: true,
        expiresAt: true,
        privacy: true,
        allowedUserIds: true,
        views: true,
        replyCount: true,
      },
    });

    return NextResponse.json({ success: true, story: mapStoryForClient(created, false) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create story' }, { status: 500 });
  }
}
