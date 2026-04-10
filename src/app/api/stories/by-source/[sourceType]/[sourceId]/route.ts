import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { cleanupExpiredStories, isVisibleToUser, mapStoryForClient, STORY_SOURCE_TYPES } from '@/lib/stories-server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sourceType: string; sourceId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sourceType, sourceId } = await params;
    if (!STORY_SOURCE_TYPES.includes(sourceType as (typeof STORY_SOURCE_TYPES)[number])) {
      return NextResponse.json({ error: 'Invalid sourceType' }, { status: 400 });
    }

    await cleanupExpiredStories();

    const stories = await db.story.findMany({
      where: {
        sourceType,
        sourceId,
        deletedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        viewEntries: {
          where: { userId: session.user.id },
          select: { id: true },
        },
      },
    });

    const visible = [];
    for (const story of stories) {
      const allowed = await isVisibleToUser(story, session.user.id);
      if (!allowed) continue;
      visible.push(mapStoryForClient(story, story.viewEntries.length > 0));
    }

    return NextResponse.json({ stories: visible });
  } catch {
    return NextResponse.json({ error: 'Failed to load stories' }, { status: 500 });
  }
}
