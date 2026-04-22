/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * Story View Handler — Production Version
 *
 * Tracks story views with privacy checks:
 * - Everyone: any user can view
 * - Contacts: only contacts can view
 * - Close-friends: restricted list
 * - Custom: explicit allow list
 */

import type { Redis } from 'ioredis';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { ExtendedWebSocket } from '../ws/handler.js';
import { db } from '../db/index.js';
import { contacts, stories, storyViews } from '../db/schema.js';

export async function handleStoryView(
  payload: {
    storyId: string;
  },
  ws: ExtendedWebSocket,
  _redis: Redis
): Promise<void> {
  const viewerId = ws.userId!;
  const { storyId } = payload;

  if (!storyId) {
    ws.send(
      JSON.stringify({
        type: 'story.view.error',
        payload: { error: 'Missing storyId', code: 'VALIDATION_ERROR' },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  let story;
  try {
    story = await db.query.stories.findFirst({
      where: eq(stories.id, storyId),
    });
  } catch (err) {
    console.error('[Story] DB error:', err);
    ws.send(
      JSON.stringify({
        type: 'story.view.error',
        payload: { error: 'Database error', code: 'DB_ERROR' },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  if (!story || story.deletedAt) {
    ws.send(
      JSON.stringify({
        type: 'story.view.error',
        payload: { error: 'Story not found', code: 'NOT_FOUND' },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  if (story.expiresAt.getTime() <= Date.now()) {
    ws.send(
      JSON.stringify({
        type: 'story.view.error',
        payload: { error: 'Story expired', code: 'EXPIRED' },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  const canView = await checkStoryPrivacy(story, viewerId);
  if (!canView) {
    ws.send(
      JSON.stringify({
        type: 'story.view.error',
        payload: { error: 'Access denied', code: 'FORBIDDEN' },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  let views = story.views;
  try {
    const inserted = await db
      .insert(storyViews)
      .values({
        storyId,
        viewerId,
        viewedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: storyViews.id });

    if (inserted.length > 0) {
      await db
        .update(stories)
        .set({ views: sql`${stories.views} + 1` })
        .where(eq(stories.id, storyId));
      views += 1;
    }
  } catch (err) {
    console.warn('[Story] Failed to record view:', err);
  }

  ws.send(
    JSON.stringify({
      type: 'story.view.ack',
      payload: {
        storyId,
        viewed: true,
        views,
        expiresAt: story.expiresAt,
      },
      timestamp: Date.now(),
    }),
    false
  );
}

async function checkStoryPrivacy(
  story: typeof stories.$inferSelect,
  viewerId: string
): Promise<boolean> {
  if (story.creatorId === viewerId) {
    return true;
  }

  switch (story.privacy) {
    case 'everyone':
      return true;
    case 'contacts': {
      const contact = await db.query.contacts.findFirst({
        where: and(eq(contacts.userId, story.creatorId), eq(contacts.contactId, viewerId)),
      });
      return !!contact;
    }
    case 'close-friends':
    case 'close_friends': {
      const contact = await db.query.contacts.findFirst({
        where: and(
          eq(contacts.userId, story.creatorId),
          eq(contacts.contactId, viewerId),
          inArray(contacts.category, ['close-friends', 'close_friends'])
        ),
      });
      return !!contact;
    }
    case 'custom': {
      const allowed = Array.isArray(story.allowedUserIds) ? story.allowedUserIds : [];
      return allowed.includes(viewerId);
    }
    default:
      return false;
  }
}
