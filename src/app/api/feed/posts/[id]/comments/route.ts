import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth-options';
import { rateLimit } from '@/lib/rate-limit';

const createCommentSchema = z.object({
  content: z.string().min(1).max(1000),
});

function toFeedTimestamp(value: Date): string {
  return value.toLocaleString();
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: postId } = await params;

    const post = await db.feedPost.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const comments = await db.feedComment.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: { name: true, avatar: true },
        },
      },
    });

    return NextResponse.json({
      comments: comments.map((comment) => ({
        id: comment.id,
        authorName: comment.author.name || 'Unknown',
        authorAvatar: comment.author.avatar || '',
        content: comment.content,
        timestamp: toFeedTimestamp(comment.createdAt),
        likes: comment.likes,
      })),
      total: comments.length,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load comments' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`feed:comment:${session.user.id}`, {
      maxRequests: 60,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many comment requests' }, { status: 429 });
    }

    const { id: postId } = await params;
    const body = await request.json();
    const parsed = createCommentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
    }

    const post = await db.feedPost.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const content = parsed.data.content.trim();

    const comment = await db.feedComment.create({
      data: {
        postId,
        authorId: session.user.id,
        content,
      },
      include: {
        author: {
          select: { name: true, avatar: true },
        },
      },
    });

    const commentsCount = await db.feedComment.count({
      where: { postId },
    });

    await db.feedPost.update({
      where: { id: postId },
      data: { comments: commentsCount },
    });

    return NextResponse.json(
      {
        success: true,
        comment: {
          id: comment.id,
          authorName: comment.author.name || 'Unknown',
          authorAvatar: comment.author.avatar || '',
          content: comment.content,
          timestamp: toFeedTimestamp(comment.createdAt),
          likes: comment.likes,
        },
        commentsCount,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }
}

