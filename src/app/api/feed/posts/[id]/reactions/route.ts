import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth-options';
import { rateLimit } from '@/lib/rate-limit';

const reactionSchema = z.object({
  action: z.enum(['like', 'dislike', 'repost']),
});

function toFeedTimestamp(value: Date): string {
  return value.toLocaleString();
}

function mapFeedPost(
  post: {
    id: string;
    authorId: string;
    title: string;
    content: string;
    likes: number;
    dislikes: number;
    comments: number;
    repostCount: number;
    createdAt: Date;
    author: { id: string; name: string; email: string; avatar: string };
    commentsList: Array<{
      id: string;
      content: string;
      likes: number;
      createdAt: Date;
      author: { name: string; avatar: string };
    }>;
    reactions: Array<{ userId: string; type: string }>;
  },
  currentUserId: string,
) {
  const isLiked = post.reactions.some((r) => r.userId === currentUserId && r.type === 'like');
  const isDisliked = post.reactions.some((r) => r.userId === currentUserId && r.type === 'dislike');
  const isReposted = post.reactions.some((r) => r.userId === currentUserId && r.type === 'repost');

  return {
    id: post.id,
    channelName: post.author.name || post.author.email || 'Unknown',
    channelAvatar: post.author.avatar || '',
    title: post.title,
    content: post.content,
    timestamp: toFeedTimestamp(post.createdAt),
    likes: post.likes,
    dislikes: post.dislikes,
    comments: post.comments,
    commentList: post.commentsList.map((comment) => ({
      id: comment.id,
      authorName: comment.author.name || 'Unknown',
      authorAvatar: comment.author.avatar || '',
      content: comment.content,
      timestamp: toFeedTimestamp(comment.createdAt),
      likes: comment.likes,
    })),
    isLiked,
    isDisliked,
    isReposted,
    repostCount: post.repostCount,
    authorId: post.authorId,
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`feed:reaction:${session.user.id}`, {
      maxRequests: 120,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many reaction requests' }, { status: 429 });
    }

    const { id: postId } = await params;
    const body = await request.json();
    const parsed = reactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
    }

    const postExists = await db.feedPost.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!postExists) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const action = parsed.data.action;

    await db.$transaction(async (tx) => {
      if (action === 'like' || action === 'dislike') {
        const opposite = action === 'like' ? 'dislike' : 'like';

        const existing = await tx.feedReaction.findUnique({
          where: {
            postId_userId_type: {
              postId,
              userId: session.user.id,
              type: action,
            },
          },
          select: { id: true },
        });

        if (existing) {
          await tx.feedReaction.delete({
            where: {
              postId_userId_type: {
                postId,
                userId: session.user.id,
                type: action,
              },
            },
          });
        } else {
          await tx.feedReaction.create({
            data: {
              postId,
              userId: session.user.id,
              type: action,
            },
          });
        }

        await tx.feedReaction.deleteMany({
          where: {
            postId,
            userId: session.user.id,
            type: opposite,
          },
        });
      } else {
        const existingRepost = await tx.feedReaction.findUnique({
          where: {
            postId_userId_type: {
              postId,
              userId: session.user.id,
              type: 'repost',
            },
          },
          select: { id: true },
        });

        if (existingRepost) {
          await tx.feedReaction.delete({
            where: {
              postId_userId_type: {
                postId,
                userId: session.user.id,
                type: 'repost',
              },
            },
          });
        } else {
          await tx.feedReaction.create({
            data: {
              postId,
              userId: session.user.id,
              type: 'repost',
            },
          });
        }
      }

      const [likes, dislikes, reposts] = await Promise.all([
        tx.feedReaction.count({ where: { postId, type: 'like' } }),
        tx.feedReaction.count({ where: { postId, type: 'dislike' } }),
        tx.feedReaction.count({ where: { postId, type: 'repost' } }),
      ]);

      await tx.feedPost.update({
        where: { id: postId },
        data: {
          likes,
          dislikes,
          repostCount: reposts,
        },
      });
    });

    const post = await db.feedPost.findUnique({
      where: { id: postId },
      include: {
        author: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        commentsList: {
          orderBy: { createdAt: 'asc' },
          take: 50,
          include: {
            author: {
              select: { name: true, avatar: true },
            },
          },
        },
        reactions: {
          where: { userId: session.user.id },
          select: { userId: true, type: true },
        },
      },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      post: mapFeedPost(post, session.user.id),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to update reaction' }, { status: 500 });
  }
}

