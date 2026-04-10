export interface ChatMembershipRef {
  id: string;
  members?: string[];
}

export interface AckStatusUpdate {
  chatId: string;
  messageId: string;
  nextStatus: 'sent' | 'delivered';
  shouldPersist: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function resolveFallbackGroupOrChannelId(payload: unknown): string {
  const record = asRecord(payload);
  if (typeof record.groupId === 'string' && record.groupId.trim().length > 0) return record.groupId;
  if (typeof record.channelId === 'string' && record.channelId.trim().length > 0) return record.channelId;
  return '';
}

export function resolveAckStatusUpdate(payload: unknown): AckStatusUpdate | null {
  const record = asRecord(payload);
  const messageId = typeof record.messageId === 'string' ? record.messageId : '';
  const chatIdRaw = typeof record.chatId === 'string' ? record.chatId : '';
  const fallbackChatId = resolveFallbackGroupOrChannelId(record);
  const chatId = chatIdRaw || fallbackChatId;

  if (!messageId || !chatId) return null;

  const deliveredValue = record.delivered;
  const delivered = typeof deliveredValue === 'number' ? deliveredValue > 0 : Boolean(deliveredValue);

  if (delivered) {
    return {
      chatId,
      messageId,
      nextStatus: 'delivered',
      shouldPersist: true,
    };
  }

  return {
    chatId,
    messageId,
    nextStatus: 'sent',
    shouldPersist: false,
  };
}

export function parseEnvelopeContent(rawContent: string): Record<string, unknown> {
  try {
    return JSON.parse(rawContent) as Record<string, unknown>;
  } catch {
    return { content: rawContent };
  }
}

export interface ReadReceiptResolution {
  chatId: string;
  messageIds: string[];
  readByUserId: string;
}

export function resolveReadReceiptUpdate(args: {
  parsed: unknown;
  fallbackChatId?: string;
  fromUserId?: string;
  chats: ChatMembershipRef[];
}): ReadReceiptResolution | null {
  const parsed = asRecord(args.parsed);
  if (parsed.kind !== 'read_receipt') return null;

  const directChatId = typeof parsed.chatId === 'string' ? parsed.chatId : '';
  const memberFallback =
    args.fromUserId && args.fromUserId.length > 0
      ? args.chats.find((entry) => Array.isArray(entry.members) && entry.members.includes(args.fromUserId || ''))?.id || ''
      : '';

  const chatId = directChatId || (args.fallbackChatId || '') || memberFallback;
  if (!chatId) return null;

  const singleMessageId = typeof parsed.messageId === 'string' ? parsed.messageId : '';
  const listMessageIds = Array.isArray(parsed.messageIds)
    ? parsed.messageIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];

  const messageIds = Array.from(new Set([singleMessageId, ...listMessageIds].filter((value) => value.length > 0)));
  if (messageIds.length === 0) return null;
  const readByUserId = typeof args.fromUserId === 'string' ? args.fromUserId : '';
  if (!readByUserId) return null;

  return {
    chatId,
    messageIds,
    readByUserId,
  };
}
