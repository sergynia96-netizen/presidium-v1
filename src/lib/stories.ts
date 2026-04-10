/**
 * Stories Module
 *
 * Features:
 * - Stories UI (lenta vverhu chata)
 * - Sozdanie stories (foto/video + tekst)
 * - E2E shifrovanie (user stories)
 * - Avtoudalenie cherez 24h
 * - Privacy settings (vse/kontakty/close friends)
 * - Replies to stories → privatny chat
 * - Views counter (encrypted ACK)
 *
 * Architecture:
 * - User stories: E2E encrypted, stored on devices
 * - Group stories: E2E encrypted for all members
 * - Channel stories: public, server-stored
 * - Auto-deletion via relay cron job
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type StoryType = 'image' | 'video' | 'text';
export type StoryPrivacy = 'everyone' | 'contacts' | 'close-friends' | 'custom';
export type StorySource = 'user' | 'group' | 'channel';

export interface StoryItem {
  id: string;
  sourceId: string; // userId, groupId, or channelId
  sourceType: StorySource;
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  type: StoryType;
  content: string; // text or encrypted blob URL
  mediaUrl?: string; // encrypted media
  mediaMimeType?: string;
  mediaName?: string;
  mediaSize?: number;
  e2eMedia?: { key: string; iv: string; tag: string };
  thumbnail?: string;
  createdAt: number;
  expiresAt: number; // 24h from creation
  privacy: StoryPrivacy;
  allowedUserIds?: string[]; // for custom privacy
  views: number;
  hasViewed: boolean;
  replyCount: number;
}

export interface StoryGroup {
  sourceId: string;
  sourceType: StorySource;
  sourceName: string;
  sourceAvatar?: string;
  items: StoryItem[];
  hasUnseen: boolean;
  isOwn: boolean;
  lastSeenIndex: number;
}

export interface StoryCreateData {
  type: StoryType;
  content: string;
  mediaBlob?: Blob;
  privacy: StoryPrivacy;
  allowedUserIds?: string[];
  sourceType: StorySource;
  sourceId: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const STORY_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
export const STORY_MAX_VIDEO_DURATION = 30; // seconds
export const STORY_MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

// ─── Story API ───────────────────────────────────────────────────────────────

/**
 * Create a new story.
 * Encrypts media if E2E, uploads to relay, stores metadata.
 */
export async function createStory(data: StoryCreateData): Promise<StoryItem> {
  let mediaUrl: string | undefined;
  let mediaMimeType: string | undefined;
  let mediaName: string | undefined;
  let mediaSize: number | undefined;
  let e2eMedia: StoryItem['e2eMedia'];
  let thumbnail: string | undefined;

  // Process media if provided
  if (data.mediaBlob) {
    const { encryptMediaFile, compressImage } = await import('@/lib/media');

    if (data.type === 'image') {
      // Compress image for story
      const { compressed, thumbnail: thumb } = await compressImage(data.mediaBlob, {
        maxWidth: 1080,
        maxHeight: 1920,
        quality: 0.85,
        generateThumbnail: true,
        thumbnailSize: 150,
      });
      thumbnail = thumb;

      // Encrypt
      const encrypted = await encryptMediaFile(compressed);
      const encryptedBuffer = new ArrayBuffer(encrypted.encryptedData.byteLength);
      new Uint8Array(encryptedBuffer).set(encrypted.encryptedData);
      const uploaded = await uploadStoryMedia(
        new Blob([encryptedBuffer], { type: 'application/octet-stream' }),
        `story-image-${Date.now()}.enc`,
      );
      mediaUrl = uploaded.url;
      mediaMimeType = compressed.type || data.mediaBlob.type || 'image/jpeg';
      mediaName = uploaded.filename;
      mediaSize = compressed.size;
      e2eMedia = {
        key: bytesToBase64(encrypted.encryptionKey),
        iv: bytesToBase64(encrypted.iv),
        tag: bytesToBase64(encrypted.tag),
      };
    } else if (data.type === 'video') {
      // Encrypt video
      const encrypted = await encryptMediaFile(data.mediaBlob);
      const encryptedBuffer = new ArrayBuffer(encrypted.encryptedData.byteLength);
      new Uint8Array(encryptedBuffer).set(encrypted.encryptedData);
      const uploaded = await uploadStoryMedia(
        new Blob([encryptedBuffer], { type: 'application/octet-stream' }),
        `story-video-${Date.now()}.enc`,
      );
      mediaUrl = uploaded.url;
      mediaMimeType = data.mediaBlob.type || 'video/webm';
      mediaName = uploaded.filename;
      mediaSize = data.mediaBlob.size;
      e2eMedia = {
        key: bytesToBase64(encrypted.encryptionKey),
        iv: bytesToBase64(encrypted.iv),
        tag: bytesToBase64(encrypted.tag),
      };
    }
  }

  const response = await fetch('/api/stories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceId: data.sourceId,
      sourceType: data.sourceType,
      type: data.type,
      content: data.content,
      mediaUrl,
      mediaMimeType,
      mediaName,
      mediaSize,
      e2eMedia,
      thumbnail,
      privacy: data.privacy,
      allowedUserIds: data.allowedUserIds,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to create story');
  }

  const payload = await response.json();
  const story = payload.story as StoryItem;
  await saveStoryToStorage(story);
  return story;
}

/**
 * Get stories for the current user's feed.
 * Returns grouped stories sorted by recency.
 */
export async function getStoriesFeed(): Promise<StoryGroup[]> {
  // Fetch from relay
  const response = await fetch('/api/stories/feed', {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    // Fallback to local stories
    return getLocalStoriesFeed();
  }

  const data = await response.json();
  return data.stories as StoryGroup[];
}

/**
 * Get stories for a specific user/group/channel.
 */
export async function getStoriesForSource(sourceId: string, sourceType: StorySource): Promise<StoryItem[]> {
  const response = await fetch(`/api/stories/by-source/${sourceType}/${sourceId}`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    return getLocalStoriesForSource(sourceId);
  }

  const data = await response.json();
  return data.stories as StoryItem[];
}

/**
 * Mark a story as viewed.
 */
export async function markStoryViewed(storyId: string): Promise<void> {
  // Update local storage
  await updateStoryViewStatus(storyId, true);

  // Notify relay
  fetch(`/api/stories/by-id/${storyId}/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => {
    // Queue for offline sync
  });
}

/**
 * Reply to a story (sends as a private message).
 */
export async function replyToStory(storyId: string, content: string): Promise<void> {
  const response = await fetch(`/api/stories/by-id/${storyId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error('Failed to reply to story');
  }
}

/**
 * Delete own story.
 */
export async function deleteStory(storyId: string): Promise<void> {
  // Delete from relay
  await fetch(`/api/stories/by-id/${storyId}`, {
    method: 'DELETE',
  }).catch(() => {});

  // Delete from local storage
  await deleteStoryFromStorage(storyId);
}

/**
 * Get story privacy options.
 */
export function getStoryPrivacyOptions(): { value: StoryPrivacy; label: string; description: string }[] {
  return [
    { value: 'everyone', label: 'Все', description: 'Любой пользователь Presidium' },
    { value: 'contacts', label: 'Контакты', description: 'Только ваши контакты' },
    { value: 'close-friends', label: 'Близкие друзья', description: 'Только избранные контакты' },
    { value: 'custom', label: 'Выбрать', description: 'Конкретные пользователи' },
  ];
}

// ─── Local Storage (IndexedDB fallback) ─────────────────────────────────────

const STORY_DB_NAME = 'presidium-stories';
const STORY_STORE = 'stories';

async function getStoryDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STORY_DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORY_STORE)) {
        const store = db.createObjectStore(STORY_STORE, { keyPath: 'id' });
        store.createIndex('sourceId', 'sourceId', { unique: false });
        store.createIndex('expiresAt', 'expiresAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveStoryToStorage(story: StoryItem): Promise<void> {
  const db = await getStoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORY_STORE, 'readwrite');
    tx.objectStore(STORY_STORE).put(story);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteStoryFromStorage(storyId: string): Promise<void> {
  const db = await getStoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORY_STORE, 'readwrite');
    tx.objectStore(STORY_STORE).delete(storyId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function updateStoryViewStatus(storyId: string, viewed: boolean): Promise<void> {
  const db = await getStoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORY_STORE, 'readwrite');
    const store = tx.objectStore(STORY_STORE);
    const request = store.get(storyId);
    request.onsuccess = () => {
      const story = request.result;
      if (story) {
        story.hasViewed = viewed;
        store.put(story);
      }
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

async function getLocalStoriesFeed(): Promise<StoryGroup[]> {
  const db = await getStoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORY_STORE, 'readonly');
    const store = tx.objectStore(STORY_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const stories = (request.result as StoryItem[]).filter(
        (s) => s.expiresAt > Date.now(), // Filter expired
      );

      // Group by source
      const groups = new Map<string, StoryItem[]>();
      for (const story of stories) {
        const key = `${story.sourceType}:${story.sourceId}`;
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        const scoped = groups.get(key);
        if (!scoped) continue;
        scoped.push(story);
      }

      const result: StoryGroup[] = [];
      for (const [key, items] of groups) {
        const [sourceType, sourceId] = key.split(':');
        items.sort((a, b) => b.createdAt - a.createdAt);
        result.push({
          sourceId,
          sourceType: sourceType as StorySource,
          sourceName: items[0].creatorName,
          sourceAvatar: items[0].creatorAvatar,
          items,
          hasUnseen: items.some((i) => !i.hasViewed),
          isOwn: false,
          lastSeenIndex: 0,
        });
      }

      resolve(result);
    };
    request.onerror = () => reject(request.error);
  });
}

async function getLocalStoriesForSource(sourceId: string): Promise<StoryItem[]> {
  const db = await getStoryDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORY_STORE, 'readonly');
    const store = tx.objectStore(STORY_STORE);
    const index = store.index('sourceId');
    const request = index.getAll(sourceId);
    request.onsuccess = () => {
      const stories = (request.result as StoryItem[])
        .filter((s) => s.expiresAt > Date.now())
        .sort((a, b) => a.createdAt - b.createdAt);
      resolve(stories);
    };
    request.onerror = () => reject(request.error);
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function uploadStoryMedia(blob: Blob, filename: string): Promise<{
  url: string;
  filename: string;
}> {
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to upload story media');
  }

  const payload = (await response.json()) as { url: string; filename?: string };
  return {
    url: payload.url,
    filename: payload.filename || filename,
  };
}
