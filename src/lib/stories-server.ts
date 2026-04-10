import { db } from '@/lib/db';

export const STORY_TYPES = ['text', 'image', 'video'] as const;
export const STORY_PRIVACY = ['everyone', 'contacts', 'close-friends', 'custom'] as const;
export const STORY_SOURCE_TYPES = ['user', 'group', 'channel'] as const;

type StoryRow = {
  id: string;
  sourceId: string;
  sourceType: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string | null;
  type: string;
  content: string;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaName: string | null;
  mediaSize: number | null;
  e2eKey: string | null;
  e2eIv: string | null;
  e2eTag: string | null;
  thumbnail: string | null;
  createdAt: Date;
  expiresAt: Date;
  privacy: string;
  allowedUserIds: string | null;
  views: number;
  replyCount: number;
};

export async function cleanupExpiredStories(): Promise<void> {
  const now = new Date();
  await db.story.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: now } }, { deletedAt: { not: null } }],
    },
  });
}

function parseAllowedUsers(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : undefined;
  } catch {
    return undefined;
  }
}

export function mapStoryForClient(story: StoryRow, hasViewed: boolean) {
  const allowedUsers = parseAllowedUsers(story.allowedUserIds);

  return {
    id: story.id,
    sourceId: story.sourceId,
    sourceType: story.sourceType,
    creatorId: story.creatorId,
    creatorName: story.creatorName,
    creatorAvatar: story.creatorAvatar || undefined,
    type: story.type,
    content: story.content,
    mediaUrl: story.mediaUrl || undefined,
    mediaMimeType: story.mediaMimeType || undefined,
    mediaName: story.mediaName || undefined,
    mediaSize: story.mediaSize ?? undefined,
    e2eMedia:
      story.e2eKey && story.e2eIv && story.e2eTag
        ? {
            key: story.e2eKey,
            iv: story.e2eIv,
            tag: story.e2eTag,
          }
        : undefined,
    thumbnail: story.thumbnail || undefined,
    createdAt: story.createdAt.getTime(),
    expiresAt: story.expiresAt.getTime(),
    privacy: story.privacy,
    allowedUserIds: allowedUsers,
    views: story.views,
    hasViewed,
    replyCount: story.replyCount,
  };
}

export async function isVisibleToUser(
  story: {
    creatorId: string;
    privacy: string;
    allowedUserIds: string | null;
  },
  viewerId: string,
): Promise<boolean> {
  if (story.creatorId === viewerId) return true;

  if (story.privacy === 'everyone') return true;

  if (story.privacy === 'custom') {
    const allowed = parseAllowedUsers(story.allowedUserIds);
    return Boolean(allowed?.includes(viewerId));
  }

  // contacts / close-friends fallback to reciprocal contact relationship.
  const relation = await db.contact.findFirst({
    where: {
      OR: [
        { userId: story.creatorId, contactId: viewerId, isBlocked: false },
        { userId: viewerId, contactId: story.creatorId, isBlocked: false },
      ],
    },
    select: { id: true },
  });

  return Boolean(relation);
}

export function groupStoriesForClient(
  stories: Array<ReturnType<typeof mapStoryForClient>>,
  currentUserId: string,
) {
  const groupsMap = new Map<
    string,
    {
      sourceId: string;
      sourceType: string;
      sourceName: string;
      sourceAvatar?: string;
      items: Array<ReturnType<typeof mapStoryForClient>>;
      hasUnseen: boolean;
      isOwn: boolean;
      lastSeenIndex: number;
    }
  >();

  for (const story of stories) {
    const key = `${story.sourceType}:${story.sourceId}`;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        sourceId: story.sourceId,
        sourceType: story.sourceType,
        sourceName: story.creatorName || 'Unknown',
        sourceAvatar: story.creatorAvatar,
        items: [],
        hasUnseen: false,
        isOwn: story.creatorId === currentUserId,
        lastSeenIndex: 0,
      });
    }

    const group = groupsMap.get(key);
    if (!group) continue;
    group.items.push(story);
    if (!story.hasViewed) group.hasUnseen = true;
  }

  const groups = Array.from(groupsMap.values());
  for (const group of groups) {
    group.items.sort((a, b) => a.createdAt - b.createdAt);
    const lastUnseen = group.items.reduce((acc, item, index) => (item.hasViewed ? acc : index), -1);
    group.lastSeenIndex = lastUnseen;
  }

  groups.sort((a, b) => {
    const aTime = a.items[a.items.length - 1]?.createdAt || 0;
    const bTime = b.items[b.items.length - 1]?.createdAt || 0;
    return bTime - aTime;
  });

  return groups;
}
