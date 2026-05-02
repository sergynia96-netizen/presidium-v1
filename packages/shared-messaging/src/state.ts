/**
 * @author Сергей Карнаух <sergynia96@gmail.com>
 * @copyright (C) 2026 Сергей Карнаух. All Rights Reserved.
 *
 * Pure state transition helpers for the messaging domain.
 *
 * INVARIANTS:
 * - No Date.now() — all timestamps are passed as parameters.
 * - No side effects — no I/O, no crypto, no storage, no network.
 * - All functions are deterministic given the same inputs.
 * - Functions return new objects; they never mutate their arguments.
 */

import type {
  DeliveryStatus,
  MessageKind,
  EncryptedPayload,
  MessageEnvelope,
  Conversation,
} from './message.js';

import type {
  OutboxMessage,
  InboxMessage,
} from './delivery.js';

import type {
  TimestampMs,
  UserId,
  DeviceId,
  ConversationId,
  MessageId,
} from './ids.js';

import {
  InvalidDeliveryTransitionError,
  InvalidConversationError,
} from './errors.js';

// ─── Delivery Status Transition Map ──────────────────────────────────────────

/**
 * Defines all valid state transitions in the delivery lifecycle.
 *
 * Keys are source states, values are the set of allowed target states.
 * "cancelled" and "failed" are terminal — they have no outgoing transitions.
 * "read" is also terminal for the normal flow.
 */
const VALID_TRANSITIONS: Record<DeliveryStatus, ReadonlySet<DeliveryStatus>> = {
  queued:    new Set(['encrypting', 'cancelled']),
  encrypting: new Set(['encrypted', 'failed', 'cancelled']),
  encrypted: new Set(['sending', 'cancelled']),
  sending:   new Set(['sent', 'failed', 'cancelled']),
  sent:      new Set(['delivered', 'failed', 'cancelled']),
  delivered: new Set(['read']),
  read:      new Set(),
  failed:    new Set(),
  cancelled: new Set(),
};

// ─── Public Helpers ──────────────────────────────────────────────────────────

/**
 * Check whether transitioning from one delivery status to another
 * is valid according to the state machine.
 *
 * This is a pure predicate — it never throws.
 */
export function canTransitionDeliveryStatus(
  from: DeliveryStatus,
  to: DeliveryStatus,
): boolean {
  return VALID_TRANSITIONS[from].has(to);
}

/**
 * Transition a message envelope to a new delivery status.
 *
 * Returns a new MessageEnvelope with the updated status.
 * Throws InvalidDeliveryTransitionError if the transition is invalid.
 */
export function transitionDeliveryStatus(
  message: MessageEnvelope,
  to: DeliveryStatus,
): MessageEnvelope {
  if (!canTransitionDeliveryStatus(message.deliveryStatus, to)) {
    throw new InvalidDeliveryTransitionError(message.deliveryStatus, to);
  }
  return { ...message, deliveryStatus: to };
}

/**
 * Mark a sent or delivered message as delivered.
 *
 * Convenience wrapper around transitionDeliveryStatus
 * that only allows the sent → delivered and delivered → delivered (no-op) paths.
 */
export function markDelivered(
  message: MessageEnvelope,
  _deliveredAt: TimestampMs,
): MessageEnvelope {
  if (message.deliveryStatus !== 'sent' && message.deliveryStatus !== 'delivered') {
    throw new InvalidDeliveryTransitionError(message.deliveryStatus, 'delivered');
  }
  return { ...message, deliveryStatus: 'delivered' };
}

/**
 * Mark a delivered message as read.
 *
 * Convenience wrapper around transitionDeliveryStatus.
 */
export function markRead(
  message: MessageEnvelope,
  _readAt: TimestampMs,
): MessageEnvelope {
  if (message.deliveryStatus !== 'delivered') {
    throw new InvalidDeliveryTransitionError(message.deliveryStatus, 'read');
  }
  return { ...message, deliveryStatus: 'read' };
}

/**
 * Create a new conversation from input data.
 *
 * Validates:
 * - At least 2 participants.
 * - No duplicate participant IDs.
 * - updatedAt must be >= createdAt.
 *
 * Throws InvalidConversationError on validation failure.
 */
export function createConversation(input: {
  id: ConversationId;
  participantIds: readonly UserId[];
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
  lastMessageId?: MessageId;
  unreadCount?: number;
}): Conversation {
  const { id, participantIds, createdAt, updatedAt, lastMessageId, unreadCount } = input;

  if (participantIds.length < 2) {
    throw new InvalidConversationError(
      `Conversation must have at least 2 participants, got ${participantIds.length}`,
    );
  }

  const uniqueIds = new Set<string>(participantIds as readonly string[]);
  if (uniqueIds.size !== participantIds.length) {
    throw new InvalidConversationError(
      'Conversation participant IDs must be unique',
    );
  }

  if (updatedAt < createdAt) {
    throw new InvalidConversationError(
      'updatedAt must be >= createdAt',
    );
  }

  return {
    id,
    participantIds,
    createdAt,
    updatedAt,
    lastMessageId,
    unreadCount: unreadCount ?? 0,
  };
}

/**
 * Create an outbound message envelope in "queued" status.
 *
 * This is the first step in the send pipeline:
 * compose → [createOutboundEnvelope] → encrypt → send → ...
 */
export function createOutboundEnvelope(input: {
  id: MessageId;
  conversationId: ConversationId;
  senderId: UserId;
  senderDeviceId: DeviceId;
  createdAt: TimestampMs;
  kind: MessageKind;
  encryptedPayload: EncryptedPayload;
}): MessageEnvelope {
  return {
    id: input.id,
    conversationId: input.conversationId,
    senderId: input.senderId,
    senderDeviceId: input.senderDeviceId,
    createdAt: input.createdAt,
    kind: input.kind,
    direction: 'outbound',
    encryptedPayload: input.encryptedPayload,
    deliveryStatus: 'queued',
  };
}

/**
 * Register an inbound message received from another participant.
 *
 * The message is created in "sent" status because it has already been
 * transmitted by the sender. The receiver will track it through
 * delivered → read.
 */
export function registerInboundEnvelope(input: {
  envelope: MessageEnvelope;
  receivedAt: TimestampMs;
  existingIds?: ReadonlySet<string>;
}): InboxMessage {
  const { envelope, receivedAt, existingIds } = input;

  if (existingIds !== undefined) {
    const rawId = envelope.id as string;
    if (existingIds.has(rawId)) {
      return {
        envelope,
        receivedAt,
        duplicateOf: envelope.id,
      };
    }
  }

  return {
    envelope,
    receivedAt,
  };
}

/**
 * Check whether an incoming message ID already exists in a set of known IDs.
 *
 * Pure predicate — never throws, never mutates.
 */
export function isDuplicateMessage(
  existingIds: ReadonlySet<string>,
  incomingId: MessageId,
): boolean {
  return existingIds.has(incomingId as string);
}
