/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 *
 * Stories Module REST API
 * - Create: text / image / video with presigned URL support
 * - List: privacy-aware filtering (everyone | contacts | close-friends | custom)
 * - View: idempotent view tracking
 * - Reply: create/find DM thread and store E2EE reply payload
 * - Delete: soft delete + media cleanup in S3
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../db/index.js';
import { chatMembers, chats, contacts, messages, stories, storyViews } from '../db/schema.js';
import { type AuthUser, authMiddleware } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rate-limit.js';
import { buildPublicUrl, deleteFromS3, getPresignedUploadUrl } from '../lib/s3.js';

const storiesRouter = new Hono();

const createSchema = z.object({
  type: z.enum(['text', 'image', 'video']),
  content: z.string().max(2000).optional(),
  mediaKey: z.string().min(1).optional(),
  thumbnailKey: z.string().min(1).optional(),
  privacy: z.enum(['everyone', 'contacts', 'close-friends', 'close_friends', 'custom']),
  allowedUserIds: z.array(z.string().uuid()).optional(),
  replyPermission: z
    .enum(['everyone', 'contacts', 'close-friends', 'close_friends', 'none'])
    .default('everyone'),
});

const replySchema = z.object({
  encryptedPayload: z.string().min(1),
  nonce: z.string().min(1),
});

function getUser(c: unknown): AuthUser {
  return (c as { get: (key: string) => unknown }).get('user') as AuthUser;
}

function normalizePrivacy(privacy: string): 'everyone' | 'contacts' | 'close-friends' | 'custom' {
  if (privacy === 'close_friends') {
    return 'close-friends';
  }
  if (
    privacy === 'everyone' ||
    privacy === 'contacts' ||
    privacy === 'close-friends' ||
    privacy === 'custom'
  ) {
    return privacy;
  }
  return 'contacts';
}

function normalizeReplyPermission(
  permission: string
): 'everyone' | 'contacts' | 'close-friends' | 'none' {
  if (permission === 'close_friends') {
    return 'close-friends';
  }
  if (
    permission === 'everyone' ||
    permission === 'contacts' ||
    permission === 'close-friends' ||
    permission === 'none'
  ) {
    return permission;
  }
  return 'everyone';
}

function extractS3KeyFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.split('/').filter(Boolean);
    return path.length > 1 ? path.slice(1).join('/') : path.join('/');
  } catch {
    return url.replace(/^\/+/, '');
  }
}

async function isContact(creatorId: string, viewerId: string): Promise<boolean> {
  const link = await db.query.contacts.findFirst({
    where: and(eq(contacts.userId, creatorId), eq(contacts.contactId, viewerId)),
    columns: { id: true },
  });
  return Boolean(link);
}

async function isCloseFriend(creatorId: string, viewerId: string): Promise<boolean> {
  const link = await db.query.contacts.findFirst({
    where: and(
      eq(contacts.userId, creatorId),
      eq(contacts.contactId, viewerId),
      inArray(contacts.category, ['close-friends', 'close_friends'])
    ),
    columns: { id: true },
  });
  return Boolean(link);
}

async function checkPrivacyAccess(
  story: typeof stories.$inferSelect,
  viewerId: string
): Promise<boolean> {
  if (story.creatorId === viewerId) {
    return true;
  }

  const privacy = normalizePrivacy(story.privacy);
  if (privacy === 'everyone') {
    return true;
  }

  if (privacy === 'contacts') {
    return isContact(story.creatorId, viewerId);
  }

  if (privacy === 'close-friends') {
    const allowed = Array.isArray(story.allowedUserIds) ? story.allowedUserIds : [];
    if (allowed.includes(viewerId)) {
      return true;
    }
    return isCloseFriend(story.creatorId, viewerId);
  }

  const allowed = Array.isArray(story.allowedUserIds) ? story.allowedUserIds : [];
  return allowed.includes(viewerId);
}

async function trackViewIfNeeded(storyId: string, viewerId: string): Promise<boolean> {
  const inserted = await db
    .insert(storyViews)
    .values({
      storyId,
      viewerId,
      viewedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning({ id: storyViews.id });

  if (inserted.length === 0) {
    return false;
  }

  await db
    .update(stories)
    .set({ views: sql`${stories.views} + 1` })
    .where(eq(stories.id, storyId));

  return true;
}

storiesRouter.post(
  '/',
  authMiddleware,
  rateLimit('story_create', 10, 60),
  zValidator('json', createSchema),
  async (c) => {
    const user = getUser(c);
    const body = c.req.valid('json');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    let mediaUrl: string | null = null;
    let thumbnailUrl: string | null = null;
    let uploadUrl: string | null = null;

    if (body.type !== 'text') {
      if (body.mediaKey) {
        mediaUrl = buildPublicUrl(body.mediaKey);
        if (body.thumbnailKey) {
          thumbnailUrl = buildPublicUrl(body.thumbnailKey);
        }
      } else {
        const key = `stories/${user.id}/${crypto.randomUUID()}/media`;
        uploadUrl = await getPresignedUploadUrl(
          key,
          body.type === 'video' ? 'video/mp4' : 'image/jpeg'
        );
        mediaUrl = buildPublicUrl(key);
      }
    }

    const [story] = await db
      .insert(stories)
      .values({
        creatorId: user.id,
        type: body.type,
        content: body.content || null,
        mediaUrl,
        thumbnail: thumbnailUrl,
        privacy: normalizePrivacy(body.privacy),
        allowedUserIds: body.allowedUserIds || [],
        replyPermission: normalizeReplyPermission(body.replyPermission),
        expiresAt,
      })
      .returning();

    return c.json({ story: { ...story, uploadUrl } }, 201);
  }
);

storiesRouter.get('/', authMiddleware, async (c) => {
  const user = getUser(c);
  const now = new Date();

  const list = await db.query.stories.findMany({
    where: and(sql`${stories.expiresAt} > ${now}`, isNull(stories.deletedAt)),
    orderBy: [desc(stories.createdAt)],
    limit: 100,
    with: {
      creator: {
        columns: {
          id: true,
          name: true,
          avatar: true,
        },
      },
    },
  });

  const creatorIds = [...new Set(list.map((item) => item.creatorId).filter((id) => id !== user.id))];

  let contactCreatorSet = new Set<string>();
  let closeFriendCreatorSet = new Set<string>();

  if (creatorIds.length > 0) {
    const contactRows = await db.query.contacts.findMany({
      where: and(eq(contacts.contactId, user.id), inArray(contacts.userId, creatorIds)),
      columns: { userId: true, category: true },
    });

    contactCreatorSet = new Set(contactRows.map((row) => row.userId));
    closeFriendCreatorSet = new Set(
      contactRows
        .filter((row) => ['close-friends', 'close_friends'].includes(row.category))
        .map((row) => row.userId)
    );
  }

  const visible = list.filter((story) => {
    if (story.creatorId === user.id) {
      return true;
    }

    const privacy = normalizePrivacy(story.privacy);
    if (privacy === 'everyone') {
      return true;
    }
    if (privacy === 'contacts') {
      return contactCreatorSet.has(story.creatorId);
    }

    const allowed = Array.isArray(story.allowedUserIds) ? story.allowedUserIds : [];
    if (allowed.includes(user.id)) {
      return true;
    }

    if (privacy === 'close-friends') {
      return closeFriendCreatorSet.has(story.creatorId);
    }

    return false;
  });

  const storyIds = visible.map((story) => story.id);
  const viewedRows =
    storyIds.length > 0
      ? await db.query.storyViews.findMany({
          where: and(eq(storyViews.viewerId, user.id), inArray(storyViews.storyId, storyIds)),
          columns: { storyId: true },
        })
      : [];
  const viewedSet = new Set(viewedRows.map((row) => row.storyId));

  return c.json({
    stories: visible.map((story) => ({
      id: story.id,
      creatorId: story.creatorId,
      creatorName: story.creator.name,
      creatorAvatar: story.creator.avatar,
      type: story.type,
      content: story.content,
      mediaUrl: story.mediaUrl,
      thumbnail: story.thumbnail,
      privacy: story.privacy,
      replyPermission: story.replyPermission,
      views: story.views,
      replyCount: story.replyCount,
      createdAt: story.createdAt,
      expiresAt: story.expiresAt,
      hasViewed: viewedSet.has(story.id),
    })),
  });
});

storiesRouter.get('/:id', authMiddleware, async (c) => {
  const user = getUser(c);
  const storyId = c.req.param('id');

  const story = await db.query.stories.findFirst({
    where: and(eq(stories.id, storyId), isNull(stories.deletedAt)),
    with: {
      creator: {
        columns: { id: true, name: true, avatar: true },
      },
    },
  });

  if (!story || story.expiresAt.getTime() <= Date.now()) {
    return c.json({ error: 'Story not found' }, 404);
  }

  const hasAccess = await checkPrivacyAccess(story, user.id);
  if (!hasAccess) {
    return c.json({ error: 'Access denied' }, 403);
  }

  const inserted = await trackViewIfNeeded(storyId, user.id);
  const views = inserted ? story.views + 1 : story.views;

  return c.json({
    story: {
      id: story.id,
      creatorId: story.creatorId,
      creatorName: story.creator.name,
      creatorAvatar: story.creator.avatar,
      type: story.type,
      content: story.content,
      mediaUrl: story.mediaUrl,
      thumbnail: story.thumbnail,
      privacy: story.privacy,
      replyPermission: story.replyPermission,
      views,
      replyCount: story.replyCount,
      createdAt: story.createdAt,
      expiresAt: story.expiresAt,
    },
  });
});

storiesRouter.post('/:id/view', authMiddleware, rateLimit('story_view', 100, 60), async (c) => {
  const user = getUser(c);
  const storyId = c.req.param('id');

  const story = await db.query.stories.findFirst({
    where: and(eq(stories.id, storyId), isNull(stories.deletedAt)),
  });

  if (!story || story.expiresAt.getTime() <= Date.now()) {
    return c.json({ error: 'Not found' }, 404);
  }

  const hasAccess = await checkPrivacyAccess(story, user.id);
  if (!hasAccess) {
    return c.json({ error: 'Access denied' }, 403);
  }

  const inserted = await trackViewIfNeeded(storyId, user.id);
  return c.json({ success: true, views: inserted ? story.views + 1 : story.views });
});

storiesRouter.post(
  '/:id/reply',
  authMiddleware,
  rateLimit('story_reply', 30, 60),
  zValidator('json', replySchema),
  async (c) => {
    const user = getUser(c);
    const storyId = c.req.param('id');
    const body = c.req.valid('json');

    const story = await db.query.stories.findFirst({
      where: and(eq(stories.id, storyId), isNull(stories.deletedAt)),
    });

    if (!story || story.expiresAt.getTime() <= Date.now()) {
      return c.json({ error: 'Not found' }, 404);
    }

    if (story.creatorId === user.id) {
      return c.json({ error: 'Cannot reply to your own story' }, 400);
    }

    const hasAccess = await checkPrivacyAccess(story, user.id);
    if (!hasAccess) {
      return c.json({ error: 'Access denied' }, 403);
    }

    const replyPermission = normalizeReplyPermission(story.replyPermission);
    if (replyPermission === 'none') {
      return c.json({ error: 'Replies disabled for this story' }, 403);
    }

    if (replyPermission === 'contacts') {
      const canReply = await isContact(story.creatorId, user.id);
      if (!canReply) {
        return c.json({ error: 'Only contacts can reply' }, 403);
      }
    }

    if (replyPermission === 'close-friends') {
      const allowed = Array.isArray(story.allowedUserIds) ? story.allowedUserIds : [];
      const closeFriend = await isCloseFriend(story.creatorId, user.id);
      if (!allowed.includes(user.id) && !closeFriend) {
        return c.json({ error: 'Only close friends can reply' }, 403);
      }
    }

    let dmChatId: string | null = null;
    const creatorMemberships = await db.query.chatMembers.findMany({
      where: and(eq(chatMembers.userId, story.creatorId), isNull(chatMembers.leftAt)),
      columns: { chatId: true },
      with: {
        chat: {
          columns: { id: true, type: true, deletedAt: true },
        },
      },
    });

    const creatorPrivateChatIds = creatorMemberships
      .filter((row) => row.chat.type === 'private' && row.chat.deletedAt === null)
      .map((row) => row.chatId);

    if (creatorPrivateChatIds.length > 0) {
      const sharedMembership = await db.query.chatMembers.findFirst({
        where: and(
          eq(chatMembers.userId, user.id),
          isNull(chatMembers.leftAt),
          inArray(chatMembers.chatId, creatorPrivateChatIds)
        ),
        columns: { chatId: true },
      });
      dmChatId = sharedMembership?.chatId || null;
    }

    if (!dmChatId) {
      const [newChat] = await db
        .insert(chats)
        .values({
          type: 'private',
          isEncrypted: true,
          createdBy: story.creatorId,
        })
        .returning({ id: chats.id });

      await db.insert(chatMembers).values([
        { chatId: newChat.id, userId: story.creatorId, role: 'owner' },
        { chatId: newChat.id, userId: user.id, role: 'member' },
      ]);

      dmChatId = newChat.id;
    }

    await db.insert(messages).values({
      chatId: dmChatId,
      senderId: user.id,
      encryptedPayload: body.encryptedPayload,
      nonce: body.nonce,
      type: 'text',
      status: 'sent',
    });

    await db
      .update(stories)
      .set({ replyCount: sql`${stories.replyCount} + 1` })
      .where(eq(stories.id, storyId));

    return c.json({ success: true, chatId: dmChatId });
  }
);

storiesRouter.delete('/:id', authMiddleware, async (c) => {
  const user = getUser(c);
  const storyId = c.req.param('id');

  const story = await db.query.stories.findFirst({
    where: and(eq(stories.id, storyId), isNull(stories.deletedAt)),
  });

  if (!story) {
    return c.json({ error: 'Not found' }, 404);
  }
  if (story.creatorId !== user.id) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  try {
    if (story.mediaUrl) {
      await deleteFromS3(extractS3KeyFromUrl(story.mediaUrl));
    }
    if (story.thumbnail) {
      await deleteFromS3(extractS3KeyFromUrl(story.thumbnail));
    }
  } catch (err) {
    console.error('[Stories] S3 cleanup error:', err);
  }

  await db
    .update(stories)
    .set({ deletedAt: new Date() })
    .where(eq(stories.id, storyId));

  return c.json({ success: true });
});

export default storiesRouter;
