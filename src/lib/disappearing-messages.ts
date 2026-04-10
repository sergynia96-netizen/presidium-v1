/**
 * Disappearing Messages Module
 *
 * Features:
 * - Per-chat timer settings (30s, 1m, 5m, 1h, 1d, 1w)
 * - Auto-deletion after timer expires
 * - Visual indicator in chat
 * - E2E: timer is part of encrypted metadata
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type DisappearingTimer = 'off' | '30s' | '1m' | '5m' | '1h' | '1d' | '1w';

export const DISAPPEARING_TIMERS: { value: DisappearingTimer; label: string; seconds: number }[] = [
  { value: 'off', label: 'Выключено', seconds: 0 },
  { value: '30s', label: '30 секунд', seconds: 30 },
  { value: '1m', label: '1 минута', seconds: 60 },
  { value: '5m', label: '5 минут', seconds: 300 },
  { value: '1h', label: '1 час', seconds: 3600 },
  { value: '1d', label: '1 день', seconds: 86400 },
  { value: '1w', label: '1 неделя', seconds: 604800 },
];

export interface DisappearingSettings {
  chatId: string;
  timer: DisappearingTimer;
  enabledBy: string;
  enabledAt: number;
}

// ─── Timer Manager ───────────────────────────────────────────────────────────

const chatTimers = new Map<string, DisappearingSettings>();
const deletionTimers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Set disappearing messages timer for a chat.
 */
export async function setDisappearingTimer(
  chatId: string,
  timer: DisappearingTimer,
  userId: string,
): Promise<DisappearingSettings> {
  const settings: DisappearingSettings = {
    chatId,
    timer,
    enabledBy: userId,
    enabledAt: Date.now(),
  };

  chatTimers.set(chatId, settings);

  // Save to storage
  await saveDisappearingSettings(settings);

  // Notify relay
  await fetch(`/api/chats/${chatId}/disappearing`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ timer }),
  }).catch(() => {});

  return settings;
}

/**
 * Get disappearing timer for a chat.
 */
export function getDisappearingTimer(chatId: string): DisappearingSettings | undefined {
  return chatTimers.get(chatId);
}

/**
 * Schedule deletion of a message based on chat timer.
 */
export function scheduleMessageDeletion(
  messageId: string,
  chatId: string,
  sentAt: number,
  onDelete: (messageId: string) => void,
): void {
  const settings = chatTimers.get(chatId);
  if (!settings || settings.timer === 'off') return;

  const timerConfig = DISAPPEARING_TIMERS.find(t => t.value === settings.timer);
  if (!timerConfig) return;

  // Calculate when to delete (from when message was read/sent)
  const deleteAt = sentAt + timerConfig.seconds * 1000;
  const delay = Math.max(0, deleteAt - Date.now());

  // Clear existing timer for this message
  const existing = deletionTimers.get(messageId);
  if (existing) clearTimeout(existing);

  // Schedule deletion
  const timer = setTimeout(() => {
    onDelete(messageId);
    deletionTimers.delete(messageId);
  }, delay);

  deletionTimers.set(messageId, timer);
}

/**
 * Cancel scheduled deletion for a message.
 */
export function cancelMessageDeletion(messageId: string): void {
  const timer = deletionTimers.get(messageId);
  if (timer) {
    clearTimeout(timer);
    deletionTimers.delete(messageId);
  }
}

/**
 * Clean up all timers for a chat.
 */
export function cleanupChatTimers(chatId: string): void {
  chatTimers.delete(chatId);

  // Clear all message deletion timers for this chat
  for (const [messageId, timer] of deletionTimers) {
    if (messageId.startsWith(chatId)) {
      clearTimeout(timer);
      deletionTimers.delete(messageId);
    }
  }
}

// ─── Storage ─────────────────────────────────────────────────────────────────

async function saveDisappearingSettings(settings: DisappearingSettings): Promise<void> {
  try {
    const data = localStorage.getItem('presidium-disappearing');
    const all: Record<string, DisappearingSettings> = data ? JSON.parse(data) : {};
    all[settings.chatId] = settings;
    localStorage.setItem('presidium-disappearing', JSON.stringify(all));
  } catch {
    // Silently fail
  }
}

/**
 * Load all disappearing settings from storage.
 */
export async function loadDisappearingSettings(): Promise<Map<string, DisappearingSettings>> {
  try {
    const data = localStorage.getItem('presidium-disappearing');
    if (data) {
      const all = JSON.parse(data) as Record<string, DisappearingSettings>;
      for (const [chatId, settings] of Object.entries(all)) {
        chatTimers.set(chatId, settings);
      }
    }
  } catch {
    // Silently fail
  }
  return chatTimers;
}
