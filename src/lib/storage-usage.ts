import type { Message } from '@/types';

export const MB_BYTES = 1024 * 1024;

const quotaFromEnv = Number(process.env.NEXT_PUBLIC_STORAGE_QUOTA_MB ?? 1024);
export const STORAGE_QUOTA_MB =
  Number.isFinite(quotaFromEnv) && quotaFromEnv > 0 ? Math.round(quotaFromEnv) : 1024;
export const STORAGE_QUOTA_BYTES = STORAGE_QUOTA_MB * MB_BYTES;

const CACHE_KEY_PATTERNS: RegExp[] = [
  /cache/i,
  /preview/i,
  /temp/i,
  /outbox/i,
];

export interface StorageBreakdownBytes {
  media: number;
  documents: number;
  voice: number;
  cache: number;
}

function normalizeBytes(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function isVoicePayload(message: Message): boolean {
  return (
    message.type === 'voice' ||
    message.mediaType === 'audio' ||
    (typeof message.mediaMimeType === 'string' && message.mediaMimeType.startsWith('audio/'))
  );
}

function isMediaPayload(message: Message): boolean {
  return (
    message.type === 'video-circle' ||
    message.mediaType === 'image' ||
    (typeof message.mediaMimeType === 'string' &&
      (message.mediaMimeType.startsWith('image/') || message.mediaMimeType.startsWith('video/')))
  );
}

export function computeMessageBreakdownBytes(
  messagesByChat: Record<string, Message[]>,
): Omit<StorageBreakdownBytes, 'cache'> {
  const totals = {
    media: 0,
    documents: 0,
    voice: 0,
  };

  for (const chatMessages of Object.values(messagesByChat)) {
    for (const message of chatMessages) {
      const bytes = normalizeBytes(message.mediaSize);
      if (bytes === 0) continue;

      if (isVoicePayload(message)) {
        totals.voice += bytes;
        continue;
      }

      if (isMediaPayload(message)) {
        totals.media += bytes;
        continue;
      }

      totals.documents += bytes;
    }
  }

  return totals;
}

export function estimateLocalCacheBytes(): number {
  if (typeof window === 'undefined') return 0;

  let bytes = 0;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (!CACHE_KEY_PATTERNS.some((pattern) => pattern.test(key))) continue;
    if (key.includes('app-store')) continue;

    const value = localStorage.getItem(key) ?? '';
    // localStorage stores UTF-16 strings.
    bytes += (key.length + value.length) * 2;
  }

  return bytes;
}

export async function clearEstimatedCache(): Promise<void> {
  if (typeof window === 'undefined') return;

  const keysToDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (!CACHE_KEY_PATTERNS.some((pattern) => pattern.test(key))) continue;
    if (key.includes('app-store')) continue;
    keysToDelete.push(key);
  }

  keysToDelete.forEach((key) => localStorage.removeItem(key));

  if ('caches' in window) {
    const cacheKeys = await caches.keys();
    await Promise.all(cacheKeys.map((key) => caches.delete(key)));
  }
}

export function bytesToMB(bytes: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  return Math.round(bytes / MB_BYTES);
}

export function formatStorageValue(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gb = bytes / (MB_BYTES * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${bytesToMB(bytes)} MB`;
}
