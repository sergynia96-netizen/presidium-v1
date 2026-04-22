import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';

import { db } from '../db/index.js';
import { contacts, feedComments, feedPosts, feedReactions } from '../db/schema.js';
import { authMiddleware, type AuthUser } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { calculateFeedScore } from '../services/feed.js';

const feedRouter = new Hono();

const createSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(50000),
  topic: z.string().max(50).optional(),
  mediaKeys: z.array(z.string()).max(10).optional(),
});

const reactionSchema = z.object({
  type: z.enum(['like', 'dislike', 'none']),
});

const commentSchema = z.object({
  content: z.string().min(1).max(5000),
  parentId: z.string().uuid().optional(),
});

function getUser(c: unknown): AuthUser {
  return (c as { get: (key: string) => unknown }).get('user') as AuthUser;
}

feedRouter.post(
  '/',
  authMiddleware,
  rateLimit('feed_create', 5, 60),
  zValidator('json', createSchema),
  async (c) => {
    const user = getUser(c);
    const body = (c.req as { valid: (target: 'json') => unknown }).valid('json') as z.infer<
      typeof createSchema
    >;

    const score = calculateFeedScore({
      authorStrikes: user.strikes,
      authorAge: Date.now() - new Date(user.createdAt).getTime(),
      hasMedia: (body.mediaKeys?.length ?? 0) > 0,
      contentLength: body.content.length,
    });

    const [post] = await db
      .insert(feedPosts)
      .values({
        authorId: user.id,
        title: body.title,
        content: body.content,
        topic: body.topic,
        mediaUrls: body.mediaKeys || [],
        algorithmicScore: score,
      })
      .returning();

    return c.json({ success: true, post });
  }
);

feedRouter.get('/', authMiddleware, async (c) => {
  const user = getUser(c);
  const cursor = c.req.query('cursor');
  const limit = Math.min(Number(c.req.query('limit') || '20'), 50);
  const topic = c.req.query('topic');

  const userContacts = await db.query.contacts.findMany({
    where: eq(contacts.userId, user.id),
    columns: { contactId: true },
  });

  const contactIds = userContacts.map((item) => item.contactId);
  contactIds.push(user.id);

  const conditions: any[] = [inArray(feedPosts.authorId, contactIds), isNull(feedPosts.deletedAt)];

  if (topic) {
    conditions.push(eq(feedPosts.topic, topic));
  }

  if (cursor) {
    conditions.push(lt(feedPosts.id, cursor));
  }

  const posts = await db.query.feedPosts.findMany({
    where: and(...conditions),
    orderBy: [desc(feedPosts.algorithmicScore), desc(feedPosts.createdAt)],
    limit: limit + 1,
    with: {
      author: {
        columns: {
          id: true,
          name: true,
          avatar: true,
        },
      },
    },
  });

  const hasMore = posts.length > limit;
  const items = hasMore ? posts.slice(0, -1) : posts;
  const nextCursor = hasMore ? items[items.length - 1]?.id || null : null;

  const postIds = items.map((item) => item.id);
  const reactions =
    postIds.length > 0
      ? await db.query.feedReactions.findMany({
          where: and(eq(feedReactions.userId, user.id), inArray(feedReactions.postId, postIds)),
        })
      : [];

  const reactionMap = new Map(reactions.map((reaction) => [reaction.postId, reaction.type]));

  const enriched = items.map((post) => ({
    ...post,
    isLiked: reactionMap.get(post.id) === 'like',
    isDisliked: reactionMap.get(post.id) === 'dislike',
  }));

  return c.json({ success: true, posts: enriched, nextCursor, hasMore });
});

feedRouter.post(
  '/:id/react',
  authMiddleware,
  zValidator('json', reactionSchema),
  async (c) => {
    const user = getUser(c);
    const postId = c.req.param('id');
    const { type } = (c.req as { valid: (target: 'json') => unknown }).valid('json') as z.infer<
      typeof reactionSchema
    >;

    const existing = await db.query.feedReactions.findFirst({
      where: and(eq(feedReactions.postId, postId), eq(feedReactions.userId, user.id)),
    });

    if (existing) {
      if (type === 'none') {
        await db.delete(feedReactions).where(eq(feedReactions.id, existing.id));

        if (existing.type === 'like') {
          await db
            .update(feedPosts)
            .set({ likes: sql`GREATEST(${feedPosts.likes} - 1, 0)` })
            .where(eq(feedPosts.id, postId));
        } else {
          await db
            .update(feedPosts)
            .set({ dislikes: sql`GREATEST(${feedPosts.dislikes} - 1, 0)` })
            .where(eq(feedPosts.id, postId));
        }
      } else if (existing.type !== type) {
        await db.update(feedReactions).set({ type }).where(eq(feedReactions.id, existing.id));

        if (type === 'like') {
          await db
            .update(feedPosts)
            .set({
              likes: sql`${feedPosts.likes} + 1`,
              dislikes: sql`GREATEST(${feedPosts.dislikes} - 1, 0)`,
            })
            .where(eq(feedPosts.id, postId));
        } else {
          await db
            .update(feedPosts)
            .set({
              likes: sql`GREATEST(${feedPosts.likes} - 1, 0)`,
              dislikes: sql`${feedPosts.dislikes} + 1`,
            })
            .where(eq(feedPosts.id, postId));
        }
      }
    } else if (type !== 'none') {
      await db.insert(feedReactions).values({ postId, userId: user.id, type });

      if (type === 'like') {
        await db
          .update(feedPosts)
          .set({ likes: sql`${feedPosts.likes} + 1` })
          .where(eq(feedPosts.id, postId));
      } else {
        await db
          .update(feedPosts)
          .set({ dislikes: sql`${feedPosts.dislikes} + 1` })
          .where(eq(feedPosts.id, postId));
      }
    }

    return c.json({ success: true });
  }
);

feedRouter.post(
  '/:id/comment',
  authMiddleware,
  rateLimit('comment', 20, 60),
  zValidator('json', commentSchema),
  async (c) => {
    const user = getUser(c);
    const postId = c.req.param('id');
    const { content, parentId } = (c.req as { valid: (target: 'json') => unknown }).valid(
      'json'
    ) as z.infer<typeof commentSchema>;

    const [comment] = await db
      .insert(feedComments)
      .values({
        postId,
        authorId: user.id,
        content,
        parentId: parentId || null,
      })
      .returning();

    await db
      .update(feedPosts)
      .set({ comments: sql`${feedPosts.comments} + 1` })
      .where(eq(feedPosts.id, postId));

    return c.json({ success: true, comment });
  }
);

feedRouter.get('/:id/comments', authMiddleware, async (c) => {
  const postId = c.req.param('id');
  const cursor = c.req.query('cursor');
  const limit = Math.min(Number(c.req.query('limit') || '20'), 50);

  const conditions: any[] = [eq(feedComments.postId, postId), isNull(feedComments.deletedAt)];
  if (cursor) {
    conditions.push(lt(feedComments.id, cursor));
  }

  const comments = await db.query.feedComments.findMany({
    where: and(...conditions),
    orderBy: [desc(feedComments.createdAt)],
    limit: limit + 1,
    with: {
      author: {
        columns: {
          id: true,
          name: true,
          avatar: true,
        },
      },
    },
  });

  const hasMore = comments.length > limit;
  const items = hasMore ? comments.slice(0, -1) : comments;

  return c.json({
    success: true,
    comments: items,
    nextCursor: hasMore ? items[items.length - 1]?.id || null : null,
  });
});

feedRouter.post('/:id/repost', authMiddleware, async (c) => {
  const user = getUser(c);
  const postId = c.req.param('id');

  const original = await db.query.feedPosts.findFirst({
    where: and(eq(feedPosts.id, postId), isNull(feedPosts.deletedAt)),
  });

  if (!original) {
    return c.json({ success: false, error: 'POST_NOT_FOUND' }, 404);
  }

  const [repost] = await db
    .insert(feedPosts)
    .values({
      authorId: user.id,
      title: original.title,
      content: original.content,
      topic: original.topic || undefined,
      mediaUrls: original.mediaUrls || [],
      isRepost: true,
      originalPostId: postId,
      algorithmicScore: calculateFeedScore({ isRepost: true }),
    })
    .returning();

  await db
    .update(feedPosts)
    .set({ repostCount: sql`${feedPosts.repostCount} + 1` })
    .where(eq(feedPosts.id, postId));

  return c.json({ success: true, post: repost });
});

export default feedRouter;
