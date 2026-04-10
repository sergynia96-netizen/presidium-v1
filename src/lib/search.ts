/**
 * Advanced Search Module
 *
 * Features:
 * - In-chat search (by text, sender, type, date)
 * - Global search (chats, messages, contacts, groups)
 * - Hashtag search
 * - @mention search
 * - Search by date range
 * - Recent searches
 * - Search suggestions
 *
 * Architecture:
 * - In-chat: search through IndexedDB messages
 * - Global: search via API endpoint
 * - Hashtags: indexed in message metadata
 * - Mentions: indexed in message metadata
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SearchFilters {
  query?: string;
  chatId?: string;
  senderId?: string;
  messageType?: 'text' | 'media' | 'voice' | 'video' | 'file' | 'link';
  dateFrom?: number;
  dateTo?: number;
  hasMedia?: boolean;
  hasLinks?: boolean;
  hasDocuments?: boolean;
  hasVoice?: boolean;
}

export interface SearchResult {
  type: 'message' | 'chat' | 'contact' | 'group' | 'channel';
  id: string;
  title: string;
  subtitle?: string;
  avatar?: string;
  highlightedText?: string;
  timestamp?: number;
  chatId?: string;
  messageId?: string;
}

export interface RecentSearch {
  query: string;
  timestamp: number;
  resultCount: number;
}

type SearchMode = 'all' | 'hashtag' | 'mention' | 'date';

interface StoredMessage {
  id: string;
  chatId: string;
  senderId?: string;
  senderName?: string;
  content?: string;
  type?: string;
  mediaUrl?: string;
  mediaName?: string;
  mediaSize?: number;
  mediaMimeType?: string;
  thumbnail?: string;
  timestamp?: number | string;
  createdAt?: string;
}

interface LocalChat {
  id: string;
  type?: string;
  name?: string;
  lastMessage?: string;
  avatar?: string;
  lastMessageTime?: number | string;
}

function normalizeTimestamp(value: number | string | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

async function fetchMessageResults(params: {
  q: string;
  mode: SearchMode;
  chatId?: string;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
}): Promise<SearchResult[] | null> {
  const searchParams = new URLSearchParams({
    q: params.q,
    mode: params.mode,
    limit: String(params.limit || 50),
  });
  if (params.chatId) searchParams.set('chatId', params.chatId);
  if (typeof params.dateFrom === 'number') searchParams.set('dateFrom', String(params.dateFrom));
  if (typeof params.dateTo === 'number') searchParams.set('dateTo', String(params.dateTo));

  try {
    const response = await fetch(`/api/search?${searchParams.toString()}`);
    if (!response.ok) return null;
    const data = (await response.json()) as { results?: SearchResult[] };
    return (data.results || []).filter((result) => result.type === 'message');
  } catch {
    return null;
  }
}

// ─── In-Chat Search ─────────────────────────────────────────────────────────

/**
 * Search messages within a specific chat.
 * Uses IndexedDB for offline search.
 */
export async function searchInChat(
  chatId: string,
  filters: Omit<SearchFilters, 'chatId'>,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  try {
    const db = await getMessagesDB();
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const request = chatId ? store.index('byChat').getAll(chatId) : store.getAll();

    const messages = await new Promise<StoredMessage[]>((resolve) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    });

    const query = filters.query?.toLowerCase() || '';

    for (const msg of messages) {
      // Filter by query
      if (query && !msg.content?.toLowerCase().includes(query)) {
        continue;
      }

      // Filter by sender
      if (filters.senderId && msg.senderId !== filters.senderId) {
        continue;
      }

      // Filter by type
      if (filters.messageType && msg.type !== filters.messageType) {
        continue;
      }

      // Filter by date
      const timestamp = normalizeTimestamp(msg.timestamp || msg.createdAt);
      if (filters.dateFrom && timestamp < filters.dateFrom) continue;
      if (filters.dateTo && timestamp > filters.dateTo) continue;

      // Filter by media
      if (filters.hasMedia && !msg.mediaUrl) continue;
      if (filters.hasLinks && !msg.content?.includes('http')) continue;

      // Highlight matching text
      let highlightedText: string | undefined;
      if (query && msg.content) {
        const idx = msg.content.toLowerCase().indexOf(query);
        if (idx >= 0) {
          const start = Math.max(0, idx - 30);
          const end = Math.min(msg.content.length, idx + query.length + 30);
          highlightedText = (start > 0 ? '...' : '') +
            msg.content.slice(start, end) +
            (end < msg.content.length ? '...' : '');
        }
      }

      results.push({
        type: 'message',
        id: msg.id,
        title: msg.content?.slice(0, 100) || 'Media',
        subtitle: msg.senderName,
        timestamp,
        chatId: msg.chatId || chatId,
        messageId: msg.id,
        highlightedText,
      });
    }
  } catch {
    // Return empty on error
  }

  // Sort by timestamp descending
  results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return results;
}

// ─── Global Search ──────────────────────────────────────────────────────────

/**
 * Search across all chats, contacts, groups, and channels.
 */
export async function globalSearch(query: string, limit: number = 20): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  try {
    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${limit}`);
    if (!response.ok) return [];

    const data = await response.json();
    return data.results || [];
  } catch {
    // Fallback: search local chats
    return searchLocalChats(query);
  }
}

/**
 * Search local chats (offline fallback).
 */
async function searchLocalChats(query: string): Promise<SearchResult[]> {
  try {
    const data = localStorage.getItem('presidium-chats');
    if (!data) return [];

    const chats = JSON.parse(data) as LocalChat[];
    const q = query.toLowerCase();

    return chats
      .filter((chat) =>
        chat.name?.toLowerCase().includes(q) ||
        chat.lastMessage?.toLowerCase().includes(q),
      )
      .slice(0, 10)
      .map((chat) => ({
        type: chat.type === 'group' ? 'group' : chat.type === 'channel' ? 'channel' : 'chat' as const,
        id: chat.id,
        title: chat.name || 'Chat',
        subtitle: chat.lastMessage,
        avatar: chat.avatar,
        timestamp: normalizeTimestamp(chat.lastMessageTime),
      }));
  } catch {
    return [];
  }
}

// ─── Hashtag Search ─────────────────────────────────────────────────────────

/**
 * Search messages by hashtag.
 */
export async function searchByHashtag(
  hashtag: string,
  chatId?: string,
): Promise<SearchResult[]> {
  const tag = hashtag.startsWith('#') ? hashtag : `#${hashtag}`;
  const remote = await fetchMessageResults({
    q: tag,
    mode: 'hashtag',
    chatId,
  });
  if (remote) return remote;
  return searchInChat(chatId || '', { query: tag });
}

/**
 * Extract all unique hashtags from a chat.
 */
export async function getChatHashtags(chatId: string): Promise<string[]> {
  const { extractHashtags } = await import('./markdown');
  const hashtags = new Set<string>();

  try {
    const db = await getMessagesDB();
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const index = store.index('byChat');
    const request = index.getAll(chatId);

    const messages = await new Promise<StoredMessage[]>((resolve) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    });

    for (const msg of messages) {
      if (msg.content) {
        for (const tag of extractHashtags(msg.content)) {
          hashtags.add(tag);
        }
      }
    }
  } catch {
    // Return empty
  }

  return Array.from(hashtags).sort();
}

// ─── Mention Search ─────────────────────────────────────────────────────────

/**
 * Search messages where a specific user was mentioned.
 */
export async function searchMentions(
  userId: string,
  chatId?: string,
): Promise<SearchResult[]> {
  const mentionToken = userId.startsWith('@') ? userId : `@${userId}`;
  const remote = await fetchMessageResults({
    q: mentionToken,
    mode: 'mention',
    chatId,
  });
  if (remote) return remote;

  const { extractMentions } = await import('./markdown');
  const results: SearchResult[] = [];

  try {
    const db = await getMessagesDB();
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const request = chatId
      ? store.index('byChat').getAll(chatId)
      : store.getAll();

    const messages = await new Promise<StoredMessage[]>((resolve) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    });

    for (const msg of messages) {
      if (msg.content) {
        const mentions = extractMentions(msg.content);
        const mentionValue = mentionToken.replace(/^@/, '');
        if (mentions.includes(mentionValue)) {
          results.push({
            type: 'message',
            id: msg.id,
            title: msg.content?.slice(0, 100) || '',
            subtitle: msg.senderName,
            timestamp: normalizeTimestamp(msg.timestamp || msg.createdAt),
            chatId: msg.chatId,
            messageId: msg.id,
          });
        }
      }
    }
  } catch {
    // Return empty
  }

  results.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return results;
}

// ─── Date Search ────────────────────────────────────────────────────────────

/**
 * Search messages by date range.
 */
export async function searchByDate(
  chatId: string,
  dateFrom: number,
  dateTo: number,
): Promise<SearchResult[]> {
  const remote = await fetchMessageResults({
    q: '*',
    mode: 'date',
    chatId,
    dateFrom,
    dateTo,
  });
  if (remote) return remote;
  return searchInChat(chatId, { dateFrom, dateTo });
}

/**
 * Jump to a specific date in chat history.
 */
export async function jumpToDate(
  chatId: string,
  date: Date,
): Promise<string | null> {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const results = await searchByDate(chatId, startOfDay.getTime(), endOfDay.getTime());
  return results.length > 0 ? results[0].messageId || null : null;
}

// ─── Media Gallery ──────────────────────────────────────────────────────────

export interface MediaItem {
  id: string;
  messageId: string;
  type: 'image' | 'video' | 'file' | 'audio';
  url: string;
  thumbnail?: string;
  name?: string;
  size?: number;
  mimeType?: string;
  timestamp: number;
  senderName: string;
}

/**
 * Get all media from a chat.
 */
export async function getChatMedia(
  chatId: string,
  type?: MediaItem['type'],
): Promise<MediaItem[]> {
  const media: MediaItem[] = [];

  try {
    const db = await getMessagesDB();
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const index = store.index('byChat');
    const request = index.getAll(chatId);

    const messages = await new Promise<StoredMessage[]>((resolve) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve([]);
    });

    for (const msg of messages) {
      if (!msg.mediaUrl) continue;
      if (type && msg.type !== type) continue;

      media.push({
        id: msg.id,
        messageId: msg.id,
        type: msg.type === 'voice' ? 'audio' : msg.type === 'video-circle' ? 'video' : (msg.type as MediaItem['type']) || 'image',
        url: msg.mediaUrl,
        thumbnail: msg.thumbnail,
        name: msg.mediaName,
        size: msg.mediaSize,
        mimeType: msg.mediaMimeType,
        timestamp: normalizeTimestamp(msg.timestamp || msg.createdAt),
        senderName: msg.senderName || 'Unknown',
      });
    }
  } catch {
    // Return empty
  }

  media.sort((a, b) => b.timestamp - a.timestamp);
  return media;
}

// ─── Recent Searches ────────────────────────────────────────────────────────

const RECENT_SEARCHES_KEY = 'presidium-recent-searches';
const MAX_RECENT_SEARCHES = 10;

export function getRecentSearches(): RecentSearch[] {
  try {
    const data = localStorage.getItem(RECENT_SEARCHES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function addRecentSearch(query: string, resultCount: number): void {
  const searches = getRecentSearches();

  // Remove if already exists
  const filtered = searches.filter(s => s.query !== query);

  // Add to front
  filtered.unshift({
    query,
    timestamp: Date.now(),
    resultCount,
  });

  // Limit
  const limited = filtered.slice(0, MAX_RECENT_SEARCHES);

  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(limited));
}

export function clearRecentSearches(): void {
  localStorage.removeItem(RECENT_SEARCHES_KEY);
}

export function removeRecentSearch(query: string): void {
  const searches = getRecentSearches();
  const filtered = searches.filter(s => s.query !== query);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(filtered));
}

// ─── Contact Sync ───────────────────────────────────────────────────────────

/**
 * Sync device contacts with Presidium.
 * Finds users by phone number.
 */
export async function syncContacts(phoneNumbers: string[]): Promise<{
  found: Array<{ phone: string; userId: string; name: string }>;
  notFound: string[];
}> {
  const response = await fetch('/api/contacts/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumbers }),
  });

  if (!response.ok) {
    return { found: [], notFound: phoneNumbers };
  }

  return response.json();
}

/**
 * Invite contacts via SMS/email.
 */
export async function inviteContacts(
  contacts: Array<{ phone?: string; email?: string; name: string }>,
): Promise<void> {
  const response = await fetch('/api/contacts/invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contacts }),
  });

  if (!response.ok) {
    throw new Error('Failed to send invitations');
  }
}

// ─── QR Code Contact Sharing ────────────────────────────────────────────────

/**
 * Generate serialized payload for contact sharing.
 */
export function generateContactQRCode(
  userId: string,
  username: string,
  displayName: string,
): string {
  return JSON.stringify({
    type: 'presidium-contact',
    userId,
    username,
    displayName,
    version: 1,
  });
}

/**
 * Generate a real QR image (data URL) for contact sharing.
 */
export async function generateContactQRCodeDataUrl(
  userId: string,
  username: string,
  displayName: string,
): Promise<string> {
  const payload = generateContactQRCode(userId, username, displayName);
  const QRCode = await import('qrcode');
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
  });
}

/**
 * Parse QR code data for contact sharing.
 */
export function parseContactQRCode(data: string): {
  userId: string;
  username: string;
  displayName: string;
} | null {
  try {
    const parsed = JSON.parse(data);
    if (parsed.type !== 'presidium-contact') return null;
    return {
      userId: parsed.userId,
      username: parsed.username,
      displayName: parsed.displayName,
    };
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getMessagesDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('presidium-crypto-db', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
