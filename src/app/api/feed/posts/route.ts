import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authOptions } from '@/lib/auth-options';
import { rateLimit } from '@/lib/rate-limit';

const createPostSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  content: z.string().min(1).max(5000),
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
  currentUserId?: string,
) {
  const isLiked = Boolean(currentUserId && post.reactions.some((r) => r.userId === currentUserId && r.type === 'like'));
  const isDisliked = Boolean(
    currentUserId && post.reactions.some((r) => r.userId === currentUserId && r.type === 'dislike'),
  );
  const isReposted = Boolean(
    currentUserId && post.reactions.some((r) => r.userId === currentUserId && r.type === 'repost'),
  );

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

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const currentUserId = session?.user?.id;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get('page') || 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 20)));
    const q = (searchParams.get('q') || '').trim();
    const skip = (page - 1) * limit;

    const where = q
      ? {
          OR: [
            { title: { contains: q } },
            { content: { contains: q } },
            { author: { name: { contains: q } } },
            { author: { email: { contains: q } } },
          ],
        }
      : {};

    const [posts, total] = await Promise.all([
      db.feedPost.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
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
            select: { userId: true, type: true },
          },
        },
      }),
      db.feedPost.count({ where }),
    ]);

    return NextResponse.json({
      posts: posts.map((post) => mapFeedPost(post, currentUserId)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + posts.length < total,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load feed posts' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`feed:create:${session.user.id}`, {
      maxRequests: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many create post requests' }, { status: 429 });
    }

    const body = await request.json();
    const parsed = createPostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.flatten() }, { status: 400 });
    }

    const content = parsed.data.content.trim();
    const title = (parsed.data.title || content.split('\n')[0] || '').trim().slice(0, 120);

    const post = await db.feedPost.create({
      data: {
        authorId: session.user.id,
        title: title || 'Post',
        content,
      },
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
          select: { userId: true, type: true },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        post: mapFeedPost(post, session.user.id),
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to create post' }, { status: 500 });
  }
}

