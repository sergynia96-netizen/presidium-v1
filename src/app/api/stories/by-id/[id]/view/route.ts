import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { cleanupExpiredStories, isVisibleToUser } from '@/lib/stories-server';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await cleanupExpiredStories();

    const story = await db.story.findUnique({
      where: { id },
      select: {
        id: true,
        creatorId: true,
        privacy: true,
        allowedUserIds: true,
        expiresAt: true,
        deletedAt: true,
      },
    });

    if (!story || story.deletedAt || story.expiresAt <= new Date()) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }

    const visible = await isVisibleToUser(story, session.user.id);
    if (!visible) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (story.creatorId !== session.user.id) {
      const existing = await db.storyView.findUnique({
        where: {
          storyId_userId: {
            storyId: story.id,
            userId: session.user.id,
          },
        },
      });

      if (!existing) {
        await db.storyView.create({
          data: {
            storyId: story.id,
            userId: session.user.id,
          },
        });
        await db.story.update({
          where: { id: story.id },
          data: { views: { increment: 1 } },
        });
      } else {
        await db.storyView.update({
          where: {
            storyId_userId: {
              storyId: story.id,
              userId: session.user.id,
            },
          },
          data: { viewedAt: new Date() },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to mark story as viewed' }, { status: 500 });
  }
}
