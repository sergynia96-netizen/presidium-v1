/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
import { useCallback, useState } from 'react';

import { PresidiumCrypto } from '@presidium/shared-crypto';

import { useAuth } from './useAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface Story {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  type: 'text' | 'image' | 'video';
  content?: string;
  mediaUrl?: string;
  thumbnail?: string;
  privacy: 'everyone' | 'contacts' | 'close-friends' | 'custom';
  allowedUserIds?: string[];
  replyPermission: 'everyone' | 'contacts' | 'close-friends' | 'none';
  views: number;
  replyCount: number;
  hasViewed: boolean;
  createdAt: number;
  expiresAt: number;
}

export interface CreateStoryInput {
  type: 'text' | 'image' | 'video';
  content?: string;
  mediaFile?: File;
  thumbnailFile?: File;
  privacy: 'everyone' | 'contacts' | 'close-friends' | 'custom';
  allowedUserIds?: string[];
  replyPermission: 'everyone' | 'contacts' | 'close-friends' | 'none';
}

type StoryApiResponse = Omit<Story, 'createdAt' | 'expiresAt'> & {
  createdAt: string | number;
  expiresAt: string | number;
};

function toTimestamp(value: string | number): number {
  if (typeof value === 'number') {
    return value;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function normalizeStory(raw: StoryApiResponse): Story {
  return {
    ...raw,
    createdAt: toTimestamp(raw.createdAt),
    expiresAt: toTimestamp(raw.expiresAt),
  };
}

function extractKeyFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname.split('/').filter(Boolean).slice(1).join('/');
  } catch {
    return url;
  }
}

function normalizePrivacy(value: Story['privacy'] | 'close_friends'): Story['privacy'] {
  if (value === 'close_friends') {
    return 'close-friends';
  }
  return value;
}

function normalizeReplyPermission(
  value: Story['replyPermission'] | 'close_friends'
): Story['replyPermission'] {
  if (value === 'close_friends') {
    return 'close-friends';
  }
  return value;
}

export function useStories() {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(false);

  const api = useCallback(
    async (path: string, options?: RequestInit) => {
      if (!token) {
        throw new Error('Authentication required');
      }

      const headers = new Headers(options?.headers || {});
      headers.set('Authorization', `Bearer ${token}`);
      if (!(options?.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
      }

      const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      return res.json() as Promise<unknown>;
    },
    [token]
  );

  const uploadToS3 = useCallback(
    async (file: File, keyHint: string): Promise<string> => {
      const ext = file.name.split('.').pop() || (file.type.startsWith('video') ? 'mp4' : 'jpg');
      const key = `stories/${user?.id || 'user'}/${crypto.randomUUID()}-${keyHint}.${ext}`;

      const signer = (await api(
        `/media/upload-url?key=${encodeURIComponent(key)}&type=${encodeURIComponent(file.type)}`
      )) as { url?: string; key?: string };

      const uploadUrl = signer.url as string;
      if (!uploadUrl) {
        throw new Error('No upload URL returned');
      }

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!uploadRes.ok) {
        throw new Error('S3 upload failed');
      }

      return signer.key as string;
    },
    [api, user?.id]
  );

  const createStory = useCallback(
    async (input: CreateStoryInput): Promise<Story> => {
      setLoading(true);
      try {
        let mediaKey: string | undefined;
        let thumbnailKey: string | undefined;

        if (input.mediaFile) {
          mediaKey = await uploadToS3(input.mediaFile, 'media');
        }
        if (input.thumbnailFile) {
          thumbnailKey = await uploadToS3(input.thumbnailFile, 'thumb');
        }

        const payload = {
          type: input.type,
          content: input.content,
          mediaKey: mediaKey ? extractKeyFromUrl(mediaKey) : undefined,
          thumbnailKey: thumbnailKey ? extractKeyFromUrl(thumbnailKey) : undefined,
          privacy: normalizePrivacy(input.privacy),
          allowedUserIds: input.allowedUserIds,
          replyPermission: normalizeReplyPermission(input.replyPermission),
        };

      const { story } = (await api('/stories', {
        method: 'POST',
        body: JSON.stringify(payload),
      })) as { story: StoryApiResponse };

      return normalizeStory(story as StoryApiResponse);
      } finally {
        setLoading(false);
      }
    },
    [api, uploadToS3]
  );

  const listStories = useCallback(async (): Promise<Story[]> => {
    const { stories } = (await api('/stories')) as { stories: StoryApiResponse[] };
    return (stories as StoryApiResponse[]).map(normalizeStory);
  }, [api]);

  const viewStory = useCallback(
    async (storyId: string): Promise<void> => {
      await api(`/stories/${storyId}/view`, { method: 'POST' });
    },
    [api]
  );

  const replyToStory = useCallback(
    async (
      storyId: string,
      recipientPublicKey: string,
      text: string
    ): Promise<{ chatId: string }> => {
      if (!user?.secretKey) {
        throw new Error('No identity keys');
      }

      const encrypted = PresidiumCrypto.encrypt(text, recipientPublicKey, user.secretKey);
      const result = (await api(`/stories/${storyId}/reply`, {
        method: 'POST',
        body: JSON.stringify({
          encryptedPayload: encrypted.encrypted,
          nonce: encrypted.nonce,
        }),
      })) as { chatId: string };

      return result as { chatId: string };
    },
    [api, user]
  );

  const deleteStory = useCallback(
    async (storyId: string): Promise<void> => {
      await api(`/stories/${storyId}`, { method: 'DELETE' });
    },
    [api]
  );

  return {
    loading,
    createStory,
    listStories,
    viewStory,
    replyToStory,
    deleteStory,
  };
}
