import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chat, Message } from '@/types';
import {
  MESSAGE_STATUS_ORDER,
  getHigherMessageStatus,
  mergeMessagesPreservingStatus,
  useAppStore,
} from '@/store/use-app-store';

function makeChat(id: string): Chat {
  return {
    id,
    type: 'private',
    name: 'Test Chat',
    avatar: '',
    lastMessage: '',
    lastMessageTime: '',
    unreadCount: 0,
    isPinned: false,
    isMuted: false,
    isEncrypted: true,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: overrides.id || 'm1',
    chatId: overrides.chatId || 'c1',
    senderId: overrides.senderId || 'u1',
    senderName: overrides.senderName || 'User',
    senderAvatar: overrides.senderAvatar || '',
    content: overrides.content || 'hello',
    timestamp: overrides.timestamp || '10:00',
    type: overrides.type || 'text',
    status: overrides.status || 'sent',
    isMe: overrides.isMe ?? true,
    mediaUrl: overrides.mediaUrl,
    mediaType: overrides.mediaType,
    mediaName: overrides.mediaName,
    mediaSize: overrides.mediaSize,
    mediaMimeType: overrides.mediaMimeType,
    isPinned: overrides.isPinned,
    isEdited: overrides.isEdited,
    replyTo: overrides.replyTo,
    forwardedFrom: overrides.forwardedFrom,
  };
}

describe('message status monotonicity', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    useAppStore.setState({
      chats: [makeChat('c1')],
      messages: { c1: [] },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('status order is monotonic by definition', () => {
    expect(MESSAGE_STATUS_ORDER.sending).toBeLessThan(MESSAGE_STATUS_ORDER.sent);
    expect(MESSAGE_STATUS_ORDER.sent).toBeLessThan(MESSAGE_STATUS_ORDER.delivered);
    expect(MESSAGE_STATUS_ORDER.delivered).toBeLessThan(MESSAGE_STATUS_ORDER.read);
  });

  it('never downgrades via getHigherMessageStatus', () => {
    expect(getHigherMessageStatus('read', 'sent')).toBe('read');
    expect(getHigherMessageStatus('delivered', 'sending')).toBe('delivered');
    expect(getHigherMessageStatus('sending', 'read')).toBe('read');
  });

  it('preserves higher status while merging duplicate ids during server resync', () => {
    const localRead = makeMessage({ id: 'm1', status: 'read', content: 'local text' });
    const serverStale = makeMessage({ id: 'm1', status: 'sent', content: 'server text' });

    const merged = mergeMessagesPreservingStatus([localRead, serverStale]);

    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('read');
    expect(merged[0].content).toBe('server text');
  });

  it('store setMessagesForChat keeps max status for same message id', () => {
    const state = useAppStore.getState();
    state.setMessagesForChat('c1', [
      makeMessage({ id: 'm-ack', chatId: 'c1', status: 'read' }),
      makeMessage({ id: 'm-ack', chatId: 'c1', status: 'sent' }),
    ]);

    const saved = useAppStore.getState().messages.c1;
    expect(saved).toHaveLength(1);
    expect(saved[0].status).toBe('read');
  });

  it('store setMessageStatus ignores downgrade attempts', () => {
    const state = useAppStore.getState();
    state.setMessagesForChat('c1', [makeMessage({ id: 'm2', chatId: 'c1', status: 'delivered' })]);

    state.setMessageStatus('c1', 'm2', 'sent');
    expect(useAppStore.getState().messages.c1[0].status).toBe('delivered');

    state.setMessageStatus('c1', 'm2', 'read');
    expect(useAppStore.getState().messages.c1[0].status).toBe('read');
  });
});
