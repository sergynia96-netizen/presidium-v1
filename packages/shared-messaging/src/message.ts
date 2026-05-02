/**
 * @author Сергей Карнаух <sergynia96@gmail.com>
 * @copyright (C) 2026 Сергей Карнаух. All Rights Reserved.
 *
 * Messaging domain models.
 *
 * These are plain data types describing the shape of messages,
 * conversations, and encrypted payloads — no behaviour, no side effects.
 */

import type {
  UserId,
  DeviceId,
  ConversationId,
  MessageId,
  MessageClientNonce,
  TimestampMs,
} from './ids.js';

// ─── Enums ───────────────────────────────────────────────────────────────────

/**
 * Delivery lifecycle of a message.
 *
 * State machine:
 *   queued → encrypting → encrypted → sending → sent → delivered → read
 *                                                     ↘ failed
 *   Any active state → cancelled
 */
export type DeliveryStatus =
  | 'queued'
  | 'encrypting'
  | 'encrypted'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'cancelled';

/** Direction of a message relative to the current device. */
export type MessageDirection = 'outbound' | 'inbound';

/** High-level content category of a message. */
export type MessageKind = 'text' | 'media' | 'system';

// ─── Encrypted Payload ───────────────────────────────────────────────────────

/**
 * An encrypted message body produced by the encryption layer.
 *
 * The messaging domain does NOT perform encryption — it only
 * carries the opaque ciphertext through the delivery pipeline.
 */
export interface EncryptedPayload {
  /** Algorithm identifier, e.g. "x25519-aes256-gcm". */
  algorithm: string;
  /** Identifier of the encryption key used. */
  keyId: string;
  /** Base64-encoded ciphertext. */
  ciphertext: string;
  /** Base64-encoded nonce / IV. */
  nonce: string;
  /** Optional additional authenticated data. */
  aad?: string;
}

// ─── Plaintext Draft ─────────────────────────────────────────────────────────

/**
 * A message before encryption, as composed by the sender.
 *
 * Only exists on the sender's device and is consumed by the
 * encryption layer to produce an EncryptedPayload.
 */
export interface PlaintextDraft {
  kind: MessageKind;
  text?: string;
  mediaRef?: string;
  clientNonce: MessageClientNonce;
  createdAt: TimestampMs;
}

// ─── Message Envelope ────────────────────────────────────────────────────────

/**
 * The core message unit that flows through the entire pipeline:
 * compose → encrypt → send → relay → receive → decrypt → display.
 *
 * Carries both metadata and the encrypted payload.
 * The plaintext is never stored inside an envelope.
 */
export interface MessageEnvelope {
  id: MessageId;
  conversationId: ConversationId;
  senderId: UserId;
  senderDeviceId: DeviceId;
  createdAt: TimestampMs;
  kind: MessageKind;
  direction: MessageDirection;
  encryptedPayload: EncryptedPayload;
  deliveryStatus: DeliveryStatus;
}

// ─── Conversation ────────────────────────────────────────────────────────────

/**
 * A conversation between two or more participants.
 *
 * For 1:1 chats, participantIds has exactly 2 entries.
 * Group chats have 3 or more.
 */
export interface Conversation {
  id: ConversationId;
  participantIds: readonly UserId[];
  createdAt: TimestampMs;
  updatedAt: TimestampMs;
  lastMessageId?: MessageId;
  unreadCount: number;
}
