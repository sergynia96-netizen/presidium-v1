/**
 * @author Сергей Карнаух <sergynia96@gmail.com>
 * @copyright (C) 2026 Сергей Карнаух. All Rights Reserved.
 *
 * Delivery tracking types: OutboxMessage and InboxMessage.
 *
 * OutboxMessage: a message the local device authored and is trying to send.
 * InboxMessage:  a message received from another participant.
 *
 * Both wrap a MessageEnvelope with additional delivery metadata.
 */

import type { MessageEnvelope } from './message.js';
import type { TimestampMs } from './ids.js';

// ─── Outbox Message ─────────────────────────────────────────────────────────

/**
 * Tracks the delivery attempt state of an outbound message.
 *
 * When the message is first queued, retryCount is 0 and nextAttemptAt
 * is absent (first attempt is immediate). On failure, retryCount
 * increments and nextAttemptAt is set to the backoff deadline.
 */
export interface OutboxMessage {
  envelope: MessageEnvelope;
  retryCount: number;
  nextAttemptAt?: TimestampMs;
  lastError?: string;
}

// ─── Inbox Message ───────────────────────────────────────────────────────────

/**
 * A message received from another participant.
 *
 * Includes server-side deduplication metadata (duplicateOf) and
 * the local receive timestamp (receivedAt).
 */
export interface InboxMessage {
  envelope: MessageEnvelope;
  receivedAt: TimestampMs;
  /** If set, this message is a duplicate of the referenced MessageId. */
  duplicateOf?: MessageEnvelope['id'];
}
