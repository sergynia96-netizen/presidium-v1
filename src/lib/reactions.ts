/**
 * Message Reactions Module
 *
 * Features:
 * - Quick reactions (emoji picker on long press)
 * - Custom emoji reactions
 * - Reaction count per message
 * - Reactors list (who reacted with what)
 * - Reaction notifications
 * - E2E encrypted reactions
 *
 * Architecture:
 * - Reactions stored alongside messages in IndexedDB
 * - Synced via relay as encrypted payloads
 * - Deduplication: one reaction per user per emoji per message
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MessageReaction {
  messageId: string;
  emoji: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  timestamp: number;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  reactors: MessageReaction[];
  isOwn: boolean;
}

export interface QuickReaction {
  emoji: string;
  label: string;
}

// ─── Default Quick Reactions ─────────────────────────────────────────────────

export const DEFAULT_QUICK_REACTIONS: QuickReaction[] = [
  { emoji: '❤️', label: 'Love' },
  { emoji: '👍', label: 'Like' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '😮', label: 'Wow' },
  { emoji: '😢', label: 'Sad' },
  { emoji: '🔥', label: 'Fire' },
  { emoji: '👏', label: 'Clap' },
  { emoji: '🎉', label: 'Party' },
];

// ─── Reactions Manager ───────────────────────────────────────────────────────

const reactionsStore = new Map<string, MessageReaction[]>();

/**
 * Add a reaction to a message.
 * Toggles if the same user already reacted with the same emoji.
 */
export async function addReaction(
  messageId: string,
  emoji: string,
  userId: string,
  userName: string,
  userAvatar?: string,
): Promise<MessageReaction | null> {
  const reactions = reactionsStore.get(messageId) || [];

  // Check if user already reacted with this emoji
  const existingIndex = reactions.findIndex(
    r => r.userId === userId && r.emoji === emoji,
  );

  if (existingIndex >= 0) {
    // Toggle off
    reactions.splice(existingIndex, 1);
    reactionsStore.set(messageId, reactions);
    await saveReactionsToStorage(messageId, reactions);
    return null;
  }

  // Add new reaction
  const reaction: MessageReaction = {
    messageId,
    emoji,
    userId,
    userName,
    userAvatar,
    timestamp: Date.now(),
  };

  reactions.push(reaction);
  reactionsStore.set(messageId, reactions);
  await saveReactionsToStorage(messageId, reactions);

  // Sync via relay
  await syncReactionToRelay(messageId, reaction, 'add');

  return reaction;
}

/**
 * Remove a reaction from a message.
 */
export async function removeReaction(
  messageId: string,
  emoji: string,
  userId: string,
): Promise<void> {
  const reactions = reactionsStore.get(messageId) || [];
  const filtered = reactions.filter(
    r => !(r.userId === userId && r.emoji === emoji),
  );

  reactionsStore.set(messageId, filtered);
  await saveReactionsToStorage(messageId, filtered);
  await syncReactionToRelay(messageId, { messageId, emoji, userId } as MessageReaction, 'remove');
}

/**
 * Get grouped reactions for a message.
 */
export function getMessageReactions(messageId: string, currentUserId: string): ReactionGroup[] {
  const reactions = reactionsStore.get(messageId) || [];
  const groups = new Map<string, MessageReaction[]>();

  for (const reaction of reactions) {
    if (!groups.has(reaction.emoji)) {
      groups.set(reaction.emoji, []);
    }
    groups.get(reaction.emoji)!.push(reaction);
  }

  const result: ReactionGroup[] = [];
  for (const [emoji, reactors] of groups) {
    result.push({
      emoji,
      count: reactors.length,
      reactors,
      isOwn: reactors.some(r => r.userId === currentUserId),
    });
  }

  // Sort by count descending
  result.sort((a, b) => b.count - a.count);
  return result;
}

/**
 * Load reactions from storage.
 */
export async function loadReactions(messageId: string): Promise<MessageReaction[]> {
  const stored = reactionsStore.get(messageId);
  if (stored) return stored;

  // Try IndexedDB
  try {
    const db = await getReactionsDB();
    return new Promise((resolve) => {
      const tx = db.transaction('reactions', 'readonly');
      const store = tx.objectStore('reactions');
      const request = store.get(messageId);
      request.onsuccess = () => {
        const reactions = request.result?.reactions || [];
        reactionsStore.set(messageId, reactions);
        resolve(reactions);
      };
      request.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

// ─── Storage ─────────────────────────────────────────────────────────────────

async function saveReactionsToStorage(messageId: string, reactions: MessageReaction[]): Promise<void> {
  try {
    const db = await getReactionsDB();
    return new Promise((resolve) => {
      const tx = db.transaction('reactions', 'readwrite');
      tx.objectStore('reactions').put({ messageId, reactions });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Silently fail
  }
}

async function syncReactionToRelay(
  _messageId: string,
  _reaction: MessageReaction,
  _action: 'add' | 'remove',
): Promise<void> {
  // TODO: Send encrypted reaction via relay
  // fetch('/api/reactions', { method: 'POST', body: JSON.stringify(...) })
}

async function getReactionsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('presidium-reactions', 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('reactions')) {
        db.createObjectStore('reactions', { keyPath: 'messageId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
