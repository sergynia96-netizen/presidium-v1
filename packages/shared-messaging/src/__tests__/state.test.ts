/**
 * Tests for messaging domain state helpers.
 */

import { describe, it, expect } from 'vitest';

import {
  createUserId,
  createDeviceId,
  createConversationId,
  createMessageId,
  createTimestampMs,
} from '../ids.js';

import type {
  MessageEnvelope,
  EncryptedPayload,
} from '../message.js';

import {
  canTransitionDeliveryStatus,
  transitionDeliveryStatus,
  markDelivered,
  markRead,
  createConversation,
  createOutboundEnvelope,
  registerInboundEnvelope,
  isDuplicateMessage,
} from '../state.js';

import {
  InvalidDeliveryTransitionError,
  InvalidConversationError,
} from '../errors.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEnvelope(overrides: Partial<MessageEnvelope> = {}): MessageEnvelope {
  const payload: EncryptedPayload = {
    algorithm: 'x25519-aes256-gcm',
    keyId: 'key-1',
    ciphertext: 'abc',
    nonce: 'nonce-1',
  };

  return {
    id: createMessageId('msg-1'),
    conversationId: createConversationId('conv-1'),
    senderId: createUserId('user-1'),
    senderDeviceId: createDeviceId('dev-1'),
    createdAt: createTimestampMs(1000),
    kind: 'text',
    direction: 'outbound',
    encryptedPayload: payload,
    deliveryStatus: 'queued',
    ...overrides,
  };
}

// ─── Valid Delivery Transitions ──────────────────────────────────────────────

describe('canTransitionDeliveryStatus', () => {
  it('allows queued → encrypting', () => {
    expect(canTransitionDeliveryStatus('queued', 'encrypting')).toBe(true);
  });

  it('allows encrypting → encrypted', () => {
    expect(canTransitionDeliveryStatus('encrypting', 'encrypted')).toBe(true);
  });

  it('allows encrypted → sending', () => {
    expect(canTransitionDeliveryStatus('encrypted', 'sending')).toBe(true);
  });

  it('allows sending → sent', () => {
    expect(canTransitionDeliveryStatus('sending', 'sent')).toBe(true);
  });

  it('allows sent → delivered', () => {
    expect(canTransitionDeliveryStatus('sent', 'delivered')).toBe(true);
  });

  it('allows delivered → read', () => {
    expect(canTransitionDeliveryStatus('delivered', 'read')).toBe(true);
  });

  it('allows encrypting → failed', () => {
    expect(canTransitionDeliveryStatus('encrypting', 'failed')).toBe(true);
  });

  it('allows sending → failed', () => {
    expect(canTransitionDeliveryStatus('sending', 'failed')).toBe(true);
  });

  it('allows sent → failed', () => {
    expect(canTransitionDeliveryStatus('sent', 'failed')).toBe(true);
  });

  it('allows queued → cancelled', () => {
    expect(canTransitionDeliveryStatus('queued', 'cancelled')).toBe(true);
  });

  it('allows any active state → cancelled', () => {
    expect(canTransitionDeliveryStatus('sending', 'cancelled')).toBe(true);
    expect(canTransitionDeliveryStatus('encrypted', 'cancelled')).toBe(true);
  });
});

// ─── Invalid Delivery Transitions ────────────────────────────────────────────

describe('transitionDeliveryStatus — invalid transitions', () => {
  it('throws for queued → sent (skipped encrypting)', () => {
    const env = makeEnvelope({ deliveryStatus: 'queued' });
    expect(() => transitionDeliveryStatus(env, 'sent'))
      .toThrow(InvalidDeliveryTransitionError);
  });

  it('throws for failed → sent (terminal state)', () => {
    const env = makeEnvelope({ deliveryStatus: 'failed' });
    expect(() => transitionDeliveryStatus(env, 'sent'))
      .toThrow(InvalidDeliveryTransitionError);
  });

  it('throws for read → delivered (no going back)', () => {
    const env = makeEnvelope({ deliveryStatus: 'read' });
    expect(() => transitionDeliveryStatus(env, 'delivered'))
      .toThrow(InvalidDeliveryTransitionError);
  });

  it('throws for cancelled → sending (terminal state)', () => {
    const env = makeEnvelope({ deliveryStatus: 'cancelled' });
    expect(() => transitionDeliveryStatus(env, 'sending'))
      .toThrow(InvalidDeliveryTransitionError);
  });

  it('throws for queued → read (skipped all intermediate states)', () => {
    const env = makeEnvelope({ deliveryStatus: 'queued' });
    expect(() => transitionDeliveryStatus(env, 'read'))
      .toThrow(InvalidDeliveryTransitionError);
  });

  it('throws for delivered → failed (delivered messages cannot fail)', () => {
    const env = makeEnvelope({ deliveryStatus: 'delivered' });
    expect(() => transitionDeliveryStatus(env, 'failed'))
      .toThrow(InvalidDeliveryTransitionError);
  });
});

// ─── Valid Transition Application ────────────────────────────────────────────

describe('transitionDeliveryStatus — valid transitions', () => {
  it('returns a new envelope with updated status', () => {
    const env = makeEnvelope({ deliveryStatus: 'queued' });
    const updated = transitionDeliveryStatus(env, 'encrypting');
    expect(updated.deliveryStatus).toBe('encrypting');
    expect(updated.id).toBe(env.id);
    // Original is not mutated
    expect(env.deliveryStatus).toBe('queued');
  });

  it('chains through the full happy path', () => {
    let env = makeEnvelope({ deliveryStatus: 'queued' });
    env = transitionDeliveryStatus(env, 'encrypting');
    env = transitionDeliveryStatus(env, 'encrypted');
    env = transitionDeliveryStatus(env, 'sending');
    env = transitionDeliveryStatus(env, 'sent');
    env = transitionDeliveryStatus(env, 'delivered');
    env = transitionDeliveryStatus(env, 'read');
    expect(env.deliveryStatus).toBe('read');
  });
});

// ─── createConversation ──────────────────────────────────────────────────────

describe('createConversation', () => {
  it('creates a conversation with valid input', () => {
    const conv = createConversation({
      id: createConversationId('conv-1'),
      participantIds: [createUserId('alice'), createUserId('bob')],
      createdAt: createTimestampMs(1000),
      updatedAt: createTimestampMs(1000),
    });

    expect(conv.id).toBe('conv-1');
    expect(conv.participantIds).toHaveLength(2);
    expect(conv.unreadCount).toBe(0);
  });

  it('defaults unreadCount to 0', () => {
    const conv = createConversation({
      id: createConversationId('conv-2'),
      participantIds: [createUserId('alice'), createUserId('bob')],
      createdAt: createTimestampMs(1000),
      updatedAt: createTimestampMs(1000),
    });

    expect(conv.unreadCount).toBe(0);
  });

  it('accepts custom unreadCount', () => {
    const conv = createConversation({
      id: createConversationId('conv-3'),
      participantIds: [createUserId('alice'), createUserId('bob')],
      createdAt: createTimestampMs(1000),
      updatedAt: createTimestampMs(2000),
      unreadCount: 5,
    });

    expect(conv.unreadCount).toBe(5);
  });

  it('throws when fewer than 2 participants', () => {
    expect(() =>
      createConversation({
        id: createConversationId('conv-bad'),
        participantIds: [createUserId('lonely')],
        createdAt: createTimestampMs(1000),
        updatedAt: createTimestampMs(1000),
      }),
    ).toThrow(InvalidConversationError);
  });

  it('throws when participant IDs are duplicated', () => {
    const sameUser = createUserId('bob');
    expect(() =>
      createConversation({
        id: createConversationId('conv-dup'),
        participantIds: [sameUser, sameUser],
        createdAt: createTimestampMs(1000),
        updatedAt: createTimestampMs(1000),
      }),
    ).toThrow(InvalidConversationError);
  });

  it('throws when updatedAt < createdAt', () => {
    expect(() =>
      createConversation({
        id: createConversationId('conv-time'),
        participantIds: [createUserId('alice'), createUserId('bob')],
        createdAt: createTimestampMs(2000),
        updatedAt: createTimestampMs(1000),
      }),
    ).toThrow(InvalidConversationError);
  });

  it('supports group conversations with 3+ participants', () => {
    const conv = createConversation({
      id: createConversationId('group-1'),
      participantIds: [
        createUserId('alice'),
        createUserId('bob'),
        createUserId('charlie'),
      ],
      createdAt: createTimestampMs(1000),
      updatedAt: createTimestampMs(1000),
    });

    expect(conv.participantIds).toHaveLength(3);
  });
});

// ─── createOutboundEnvelope ──────────────────────────────────────────────────

describe('createOutboundEnvelope', () => {
  it('creates a queued outbound message', () => {
    const env = createOutboundEnvelope({
      id: createMessageId('msg-out-1'),
      conversationId: createConversationId('conv-1'),
      senderId: createUserId('alice'),
      senderDeviceId: createDeviceId('phone-1'),
      createdAt: createTimestampMs(5000),
      kind: 'text',
      encryptedPayload: {
        algorithm: 'x25519-aes256-gcm',
        keyId: 'key-1',
        ciphertext: 'encrypted-data',
        nonce: 'nonce-1',
      },
    });

    expect(env.id).toBe('msg-out-1');
    expect(env.direction).toBe('outbound');
    expect(env.deliveryStatus).toBe('queued');
    expect(env.kind).toBe('text');
  });

  it('creates a media message envelope', () => {
    const env = createOutboundEnvelope({
      id: createMessageId('msg-media-1'),
      conversationId: createConversationId('conv-1'),
      senderId: createUserId('alice'),
      senderDeviceId: createDeviceId('phone-1'),
      createdAt: createTimestampMs(6000),
      kind: 'media',
      encryptedPayload: {
        algorithm: 'x25519-aes256-gcm',
        keyId: 'key-2',
        ciphertext: 'encrypted-media',
        nonce: 'nonce-2',
        aad: 'media-meta',
      },
    });

    expect(env.kind).toBe('media');
    expect(env.encryptedPayload.aad).toBe('media-meta');
  });
});

// ─── markDelivered ───────────────────────────────────────────────────────────

describe('markDelivered', () => {
  it('transitions sent → delivered', () => {
    const env = makeEnvelope({ deliveryStatus: 'sent' });
    const delivered = markDelivered(env, createTimestampMs(7000));
    expect(delivered.deliveryStatus).toBe('delivered');
    expect(env.deliveryStatus).toBe('sent'); // not mutated
  });

  it('is idempotent for already-delivered messages', () => {
    const env = makeEnvelope({ deliveryStatus: 'delivered' });
    const delivered = markDelivered(env, createTimestampMs(8000));
    expect(delivered.deliveryStatus).toBe('delivered');
  });

  it('throws for queued → delivered', () => {
    const env = makeEnvelope({ deliveryStatus: 'queued' });
    expect(() => markDelivered(env, createTimestampMs(7000)))
      .toThrow(InvalidDeliveryTransitionError);
  });

  it('throws for failed → delivered', () => {
    const env = makeEnvelope({ deliveryStatus: 'failed' });
    expect(() => markDelivered(env, createTimestampMs(7000)))
      .toThrow(InvalidDeliveryTransitionError);
  });
});

// ─── markRead ───────────────────────────────────────────────────────────────

describe('markRead', () => {
  it('transitions delivered → read', () => {
    const env = makeEnvelope({ deliveryStatus: 'delivered' });
    const read = markRead(env, createTimestampMs(9000));
    expect(read.deliveryStatus).toBe('read');
    expect(env.deliveryStatus).toBe('delivered'); // not mutated
  });

  it('throws for sent → read (must be delivered first)', () => {
    const env = makeEnvelope({ deliveryStatus: 'sent' });
    expect(() => markRead(env, createTimestampMs(9000)))
      .toThrow(InvalidDeliveryTransitionError);
  });

  it('throws for queued → read', () => {
    const env = makeEnvelope({ deliveryStatus: 'queued' });
    expect(() => markRead(env, createTimestampMs(9000)))
      .toThrow(InvalidDeliveryTransitionError);
  });
});

// ─── Duplicate Detection ────────────────────────────────────────────────────

describe('isDuplicateMessage', () => {
  it('returns true for a known message ID', () => {
    const existing = new Set<string>(['msg-1', 'msg-2', 'msg-3']);
    expect(isDuplicateMessage(existing, createMessageId('msg-2'))).toBe(true);
  });

  it('returns false for a new message ID', () => {
    const existing = new Set<string>(['msg-1', 'msg-2']);
    expect(isDuplicateMessage(existing, createMessageId('msg-99'))).toBe(false);
  });

  it('returns false for an empty set', () => {
    expect(isDuplicateMessage(new Set(), createMessageId('msg-1'))).toBe(false);
  });
});

// ─── registerInboundEnvelope ────────────────────────────────────────────────

describe('registerInboundEnvelope', () => {
  it('registers a new inbound message', () => {
    const env = makeEnvelope({
      id: createMessageId('msg-in-1'),
      direction: 'inbound',
      deliveryStatus: 'sent',
    });

    const inbox = registerInboundEnvelope({
      envelope: env,
      receivedAt: createTimestampMs(10000),
    });

    expect(inbox.envelope.id).toBe('msg-in-1');
    expect(inbox.receivedAt).toBe(10000);
    expect(inbox.duplicateOf).toBeUndefined();
  });

  it('marks a duplicate when existingIds contains the message', () => {
    const env = makeEnvelope({
      id: createMessageId('msg-dup-1'),
      direction: 'inbound',
      deliveryStatus: 'sent',
    });

    const existingIds = new Set<string>(['msg-dup-1', 'msg-other']);
    const inbox = registerInboundEnvelope({
      envelope: env,
      receivedAt: createTimestampMs(11000),
      existingIds,
    });

    expect(inbox.duplicateOf).toBe('msg-dup-1');
  });

  it('does not mark duplicate when existingIds is not provided', () => {
    const env = makeEnvelope({
      id: createMessageId('msg-no-dedup'),
      direction: 'inbound',
      deliveryStatus: 'sent',
    });

    const inbox = registerInboundEnvelope({
      envelope: env,
      receivedAt: createTimestampMs(12000),
    });

    expect(inbox.duplicateOf).toBeUndefined();
  });

  it('does not mark duplicate when existingIds does not contain the message', () => {
    const env = makeEnvelope({
      id: createMessageId('msg-new'),
      direction: 'inbound',
      deliveryStatus: 'sent',
    });

    const existingIds = new Set<string>(['msg-other']);
    const inbox = registerInboundEnvelope({
      envelope: env,
      receivedAt: createTimestampMs(13000),
      existingIds,
    });

    expect(inbox.duplicateOf).toBeUndefined();
  });
});
