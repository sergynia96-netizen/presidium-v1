/**
 * @author Сергей Карнаух <sergynia96@gmail.com>
 * @copyright (C) 2026 Сергей Карнаух. All Rights Reserved.
 *
 * Delivery tracking types: OutboxMessage, InboxMessage, OutboxEntry,
 * and retry policy configuration.
 *
 * OutboxMessage: a message the local device authored and is trying to send.
 * InboxMessage:  a message received from another participant.
 * OutboxEntry:   a structured outbox record for the repository layer,
 *                with version tracking, retry state, and timestamps.
 *
 * Both wrap a MessageEnvelope with additional delivery metadata.
 */

import type { MessageEnvelope } from './message.js';
import type { TimestampMs, MessageId } from './ids.js';

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

// ─── Outbox Status ───────────────────────────────────────────────────────────

/**
 * Lifecycle status of an outbox entry.
 *
 * State machine:
 *   pending → sending → delivered
 *   pending → retry → sending → delivered
 *                      ↘ failed (retry budget exhausted)
 *   pending → cancelled
 *   retry → cancelled
 *
 * "pending" is the initial state when a message is first enqueued.
 * "retry" is entered after a delivery failure when retries remain.
 * "sending" is a transient state during active delivery (prevents concurrent sends).
 * "delivered" and "failed" are terminal states.
 * "cancelled" is a terminal state entered by user action.
 */
export type OutboxStatus = 'pending' | 'sending' | 'retry' | 'delivered' | 'failed' | 'cancelled';

// ─── Outbox Entry ────────────────────────────────────────────────────────────

/**
 * A structured outbox record for the repository layer.
 *
 * Extends the concept of OutboxMessage with:
 * - Explicit status field (OutboxStatus) for richer state tracking.
 * - Version field for optimistic locking (future use).
 * - Timestamps for lifecycle events (enqueued, sent, completed).
 * - Typed association with MessageId (not the full envelope).
 *
 * The envelope is stored separately in the MessageRepository;
 * this entry only holds the messageId reference for efficiency.
 */
export interface OutboxEntry {
  /** The message this outbox entry tracks. */
  readonly messageId: MessageId;
  /** Current lifecycle status. */
  readonly status: OutboxStatus;
  /** Number of delivery attempts made so far. */
  readonly retryCount: number;
  /** Timestamp when the entry was first enqueued. */
  readonly enqueuedAt: TimestampMs;
  /** Timestamp of the last delivery attempt, if any. */
  readonly lastAttemptAt?: TimestampMs;
  /**
   * Timestamp when the next retry should be attempted.
   * Absent for "pending" (immediate first attempt) and terminal states.
   */
  readonly nextAttemptAt?: TimestampMs;
  /** Description of the last failure, if any. */
  readonly lastError?: string;
  /**
   * Optimistic locking version.
   * Incremented on every update. Clients must provide the expected
   * version when updating to detect concurrent modifications.
   */
  readonly version: number;
  /** Timestamp when delivery was completed (delivered/failed/cancelled). */
  readonly completedAt?: TimestampMs;
}

// ─── Retry Policy ───────────────────────────────────────────────────────────

/**
 * Configuration for exponential backoff retry behaviour.
 *
 * Controls how the outbox worker schedules retries after delivery failures.
 * The backoff formula is: baseDelayMs * 2^attemptIndex, capped at maxDelayMs.
 *
 * Example with defaults:
 *   Attempt 1: 1000ms (1s)
 *   Attempt 2: 2000ms (2s)
 *   Attempt 3: 4000ms (4s)
 *   Attempt 4: 8000ms (8s)
 *   Attempt 5: 16000ms (16s) — max reached
 */
export interface RetryPolicy {
  /** Base delay in milliseconds for the first retry. */
  readonly baseDelayMs: number;
  /** Multiplier applied per retry attempt (exponential factor). */
  readonly multiplier: number;
  /** Maximum delay in milliseconds (caps exponential growth). */
  readonly maxDelayMs: number;
  /** Maximum number of retry attempts before giving up. */
  readonly maxRetries: number;
}

// ─── Pure Functions ──────────────────────────────────────────────────────────

/**
 * Compute the delay before the next retry attempt using exponential backoff.
 *
 * Formula: min(baseDelayMs * multiplier ^ attempt, maxDelayMs)
 *
 * This is a pure function — no side effects, no Date.now().
 * The caller is responsible for adding the delay to the current timestamp
 * to produce the absolute nextAttemptAt value.
 *
 * @param attempt - Zero-based attempt index (0 = first retry, 1 = second, etc.).
 * @param policy - The retry policy configuration.
 * @returns The delay in milliseconds before the next attempt.
 */
export function computeRetryDelay(attempt: number, policy: RetryPolicy): number {
  const exponentialDelay = policy.baseDelayMs * Math.pow(policy.multiplier, attempt);
  return Math.min(exponentialDelay, policy.maxDelayMs);
}

/**
 * Default retry policy: 1s base, 2x multiplier, 16s max, 5 retries.
 *
 * Produces the sequence: 1s → 2s → 4s → 8s → 16s → give up.
 */
export const DEFAULT_RETRY_POLICY: Readonly<RetryPolicy> = {
  baseDelayMs: 1000,
  multiplier: 2,
  maxDelayMs: 16_000,
  maxRetries: 5,
} as const;
