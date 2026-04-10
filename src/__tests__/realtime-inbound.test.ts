import { describe, expect, it } from 'vitest';
import {
  parseEnvelopeContent,
  resolveAckStatusUpdate,
  resolveFallbackGroupOrChannelId,
  resolveReadReceiptUpdate,
} from '@/lib/realtime-inbound';

describe('realtime inbound helpers', () => {
  it('resolves delivered ack with direct chatId', () => {
    const result = resolveAckStatusUpdate({
      messageId: 'm1',
      chatId: 'c1',
      delivered: 2,
    });

    expect(result).toEqual({
      chatId: 'c1',
      messageId: 'm1',
      nextStatus: 'delivered',
      shouldPersist: true,
    });
  });

  it('resolves sent ack with fallback groupId', () => {
    const result = resolveAckStatusUpdate({
      messageId: 'm2',
      groupId: 'g1',
      delivered: 0,
      storedOffline: true,
    });

    expect(result).toEqual({
      chatId: 'g1',
      messageId: 'm2',
      nextStatus: 'sent',
      shouldPersist: false,
    });
  });

  it('returns null for malformed ack payload', () => {
    expect(resolveAckStatusUpdate({ chatId: 'c1' })).toBeNull();
    expect(resolveAckStatusUpdate({ messageId: 'm1' })).toBeNull();
  });

  it('resolves fallback group/channel ids in order', () => {
    expect(resolveFallbackGroupOrChannelId({ groupId: 'group-1', channelId: 'chan-1' })).toBe('group-1');
    expect(resolveFallbackGroupOrChannelId({ channelId: 'chan-1' })).toBe('chan-1');
    expect(resolveFallbackGroupOrChannelId({})).toBe('');
  });

  it('parses envelope JSON and handles plain text fallback', () => {
    expect(parseEnvelopeContent('{"kind":"read_receipt"}')).toEqual({ kind: 'read_receipt' });
    expect(parseEnvelopeContent('plain text')).toEqual({ content: 'plain text' });
  });

  it('resolves read receipt using explicit chatId and dedupes message ids', () => {
    const result = resolveReadReceiptUpdate({
      parsed: {
        kind: 'read_receipt',
        chatId: 'c-explicit',
        messageId: 'm1',
        messageIds: ['m1', 'm2', '', 'm3'],
      },
      fallbackChatId: 'c-fallback',
      fromUserId: 'u-peer',
      chats: [],
    });

    expect(result).toEqual({
      chatId: 'c-explicit',
      messageIds: ['m1', 'm2', 'm3'],
      readByUserId: 'u-peer',
    });
  });

  it('resolves read receipt via fallback chat id when direct chat missing', () => {
    const result = resolveReadReceiptUpdate({
      parsed: {
        kind: 'read_receipt',
        messageId: 'm1',
      },
      fallbackChatId: 'group-123',
      fromUserId: 'u-peer',
      chats: [],
    });

    expect(result).toEqual({
      chatId: 'group-123',
      messageIds: ['m1'],
      readByUserId: 'u-peer',
    });
  });

  it('resolves read receipt via member lookup fallback', () => {
    const result = resolveReadReceiptUpdate({
      parsed: {
        kind: 'read_receipt',
        messageIds: ['m9'],
      },
      fromUserId: 'u-peer',
      chats: [
        { id: 'chat-a', members: ['u-self', 'u-peer'] },
        { id: 'chat-b', members: ['u-self', 'u-other'] },
      ],
    });

    expect(result).toEqual({
      chatId: 'chat-a',
      messageIds: ['m9'],
      readByUserId: 'u-peer',
    });
  });

  it('returns null for non read-receipt or empty ids', () => {
    expect(
      resolveReadReceiptUpdate({
        parsed: { kind: 'typing' },
        chats: [],
      }),
    ).toBeNull();

    expect(
      resolveReadReceiptUpdate({
        parsed: { kind: 'read_receipt', chatId: 'c1' },
        chats: [],
      }),
    ).toBeNull();
  });
});
