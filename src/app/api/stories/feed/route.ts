import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { cleanupExpiredStories, groupStoriesForClient, isVisibleToUser, mapStoryForClient } from '@/lib/stories-server';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await cleanupExpiredStories();

    const stories = await db.story.findMany({
      where: {
        deletedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        viewEntries: {
          where: { userId: session.user.id },
          select: { id: true },
        },
      },
    });

    const visibleStories = [];
    for (const story of stories) {
      const visible = await isVisibleToUser(story, session.user.id);
      if (!visible) continue;
      visibleStories.push(mapStoryForClient(story, story.viewEntries.length > 0));
    }

    const grouped = groupStoriesForClient(visibleStories, session.user.id);
    return NextResponse.json({ stories: grouped });
  } catch {
    return NextResponse.json({ error: 'Failed to load stories feed' }, { status: 500 });
  }
}
