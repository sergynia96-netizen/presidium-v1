/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 *
 * Auto-cleanup for expired Stories (24h TTL).
 */
import { and, eq, isNull, lt } from 'drizzle-orm';

import { db } from '../db/index.js';
import { stories } from '../db/schema.js';
import { deleteFromS3 } from '../lib/s3.js';

function extractKey(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    return segments.length > 1 ? segments.slice(1).join('/') : segments.join('/');
  } catch {
    return url.replace(/^\/+/, '');
  }
}

export async function cleanupExpiredStories(): Promise<{ cleaned: number }> {
  const expired = await db.query.stories.findMany({
    where: and(lt(stories.expiresAt, new Date()), isNull(stories.deletedAt)),
    columns: { id: true, mediaUrl: true, thumbnail: true },
  });

  for (const story of expired) {
    try {
      if (story.mediaUrl) {
        await deleteFromS3(extractKey(story.mediaUrl));
      }
      if (story.thumbnail) {
        await deleteFromS3(extractKey(story.thumbnail));
      }
    } catch (err) {
      console.error(`[Cleanup] S3 delete failed for story ${story.id}:`, err);
    }

    await db
      .update(stories)
      .set({ deletedAt: new Date() })
      .where(eq(stories.id, story.id));
  }

  console.log(`[Cron] Cleaned up ${expired.length} expired stories`);
  return { cleaned: expired.length };
}
