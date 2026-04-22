import { and, eq, isNull, lt } from 'drizzle-orm';

import { db } from '../db/index.js';
import { stories } from '../db/schema.js';
import { deleteObject } from '../services/minio.js';

function extractObjectKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.split('/').filter(Boolean);
    if (path.length === 0) {
      return null;
    }

    if (path.length > 1) {
      return path.slice(1).join('/');
    }

    return path[0] || null;
  } catch {
    return url || null;
  }
}

export async function cleanupExpiredStories() {
  console.log('[Cron] Starting stories cleanup...');

  const expired = await db.query.stories.findMany({
    where: and(lt(stories.expiresAt, new Date()), isNull(stories.deletedAt)),
  });

  for (const story of expired) {
    if (story.mediaUrl) {
      try {
        const key = extractObjectKey(story.mediaUrl);
        if (key) {
          await deleteObject(key);
        }
      } catch (err) {
        console.error('[Cron] Failed to delete media:', err);
      }
    }

    await db
      .update(stories)
      .set({ deletedAt: new Date() })
      .where(eq(stories.id, story.id));
  }

  console.log(`[Cron] Cleaned up ${expired.length} expired stories`);
}

export function startStoriesCron() {
  cleanupExpiredStories().catch((err) => {
    console.error('[Cron] Initial cleanup failed:', err);
  });

  setInterval(() => {
    cleanupExpiredStories().catch((err) => {
      console.error('[Cron] Scheduled cleanup failed:', err);
    });
  }, 60 * 60 * 1000);
}
