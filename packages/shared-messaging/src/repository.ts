/**
 * @author Сергей Карнаух <sergynia96@gmail.com>
 * @copyright (C) 2026 Сергей Карнаух. All Rights Reserved.
 *
 * Repository contract interfaces for the messaging domain.
 *
 * These are ABSTRACT interfaces — no implementation is provided here.
 * Concrete implementations will be supplied by infrastructure packages
 * (e.g., PostgreSQL, SQLite, in-memory for tests).
 *
 * DESIGN DECISIONS:
 * - All methods return Promise<T> — repositories are inherently async.
 * - Methods declare which errors they MAY throw via JSDoc.
 *   Implementations are not required to throw these errors, but
 *   callers must be prepared to handle them.
 * - Version fields are included for future optimistic locking support.
 *   Implementations may ignore them initially.
 * - Both soft-delete (via status) and hard-delete are supported
 *   for GDPR compliance.
 */

import type { MessageEnvelope, Conversation } from './message.js';
import type { OutboxEntry } from './delivery.js';
import type { MessageId, ConversationId, TimestampMs, UserId } from './ids.js';
import type {
  MessageFilter,
  ConversationFilter,
  SortOptions,
  Pagination,
  PaginatedResult,
} from './query.js';

// ─── MessageRepository ───────────────────────────────────────────────────────

/**
 * Abstract repository for message persistence and retrieval.
 *
 * Provides CRUD operations for MessageEnvelope entities,
 * plus batch operations for efficient bulk processing.
 *
 * @throws {RepositoryNotFoundError} - On findById / delete when entity missing.
 * @throws {RepositoryConcurrencyError} - On update when version mismatch.
 * @throws {RepositoryConflictError} - On save when unique constraint violated.
 */
export interface MessageRepository {
  /**
   * Persist a new message envelope.
   *
   * @param message - The message to persist. Must not already exist.
   * @returns The persisted message (with storage-generated fields if any).
   * @throws {RepositoryConflictError} If a message with the same ID already exists.
   */
  save(message: MessageEnvelope): Promise<MessageEnvelope>;

  /**
   * Retrieve a message by its unique identifier.
   *
   * @param id - The MessageId to look up.
   * @returns The message envelope, or undefined if not found.
   */
  findById(id: MessageId): Promise<MessageEnvelope | undefined>;

  /**
   * List messages in a conversation with optional filtering and pagination.
   *
   * @param conversationId - The conversation to list messages for.
   * @param pagination - Pagination strategy (cursor or offset).
   * @param sort - Optional sort options. Defaults to createdAt desc.
   * @param filter - Optional additional filters (sender, status, kind, time range).
   * @returns A paginated result of message envelopes.
   */
  findByConversation(
    conversationId: ConversationId,
    pagination: Pagination,
    sort?: SortOptions,
    filter?: MessageFilter,
  ): Promise<PaginatedResult<MessageEnvelope>>;

  /**
   * Update the delivery status of an existing message.
   *
   * Performs an atomic status transition. The implementation should
   * verify that the transition is valid according to the state machine
   * defined in state.ts (or delegate to transitionDeliveryStatus).
   *
   * @param id - The message to update.
   * @param status - The new delivery status.
   * @param expectedVersion - Optional version for optimistic locking.
   *   If provided, the update is rejected if the stored version differs.
   * @returns The updated message envelope.
   * @throws {RepositoryNotFoundError} If the message does not exist.
   * @throws {RepositoryConcurrencyError} If the version does not match.
   */
  updateStatus(
    id: MessageId,
    status: MessageEnvelope['deliveryStatus'],
    expectedVersion?: number,
  ): Promise<MessageEnvelope>;

  /**
   * Soft-delete a message by moving it to "deleted" status.
   *
   * The message remains in storage but is excluded from normal queries.
   * Use hardDelete for permanent removal (GDPR compliance).
   *
   * @param id - The message to soft-delete.
   * @throws {RepositoryNotFoundError} If the message does not exist.
   */
  softDelete(id: MessageId): Promise<void>;

  /**
   * Permanently remove a message from storage.
   *
   * This operation is irreversible. Use for GDPR "right to be forgotten"
   * or explicit user action. Prefer softDelete for general cases.
   *
   * @param id - The message to remove.
   * @throws {RepositoryNotFoundError} If the message does not exist.
   */
  hardDelete(id: MessageId): Promise<void>;

  /**
   * List messages matching a filter with pagination and sorting.
   *
   * A general-purpose query method for admin, audit, or search use cases.
   *
   * @param filter - Filter criteria.
   * @param pagination - Pagination strategy.
   * @param sort - Sort options. Defaults to createdAt desc.
   * @returns A paginated result of matching message envelopes.
   */
  find(
    filter: MessageFilter,
    pagination: Pagination,
    sort?: SortOptions,
  ): Promise<PaginatedResult<MessageEnvelope>>;

  /**
   * Count messages matching a filter.
   *
   * @param filter - Filter criteria. If omitted, counts all messages.
   * @returns The total count of matching messages.
   */
  count(filter?: MessageFilter): Promise<number>;
}

// ─── OutboxRepository ────────────────────────────────────────────────────────

/**
 * Abstract repository for outbox (delivery tracking) persistence.
 *
 * The outbox pattern decouples message sending from delivery tracking:
 * messages are written to the outbox first, then a background worker
 * polls for pending entries and drives the delivery pipeline.
 *
 * @throws {RepositoryNotFoundError} - On operations targeting a missing entry.
 * @throws {RepositoryConcurrencyError} - On retry update when version mismatch.
 */
export interface OutboxRepository {
  /**
   * Add a new entry to the outbox for delivery tracking.
   *
   * @param entry - The outbox entry to enqueue.
   * @returns The persisted entry (with storage-generated fields if any).
   * @throws {RepositoryConflictError} If an entry with the same messageId already exists.
   */
  enqueue(entry: OutboxEntry): Promise<OutboxEntry>;

  /**
   * Retrieve a pending outbox entry by its associated message ID.
   *
   * @param messageId - The MessageId the outbox entry tracks.
   * @returns The outbox entry, or undefined if not found.
   */
  findByMessageId(messageId: MessageId): Promise<OutboxEntry | undefined>;

  /**
   * List outbox entries that are due for a retry attempt.
   *
   * Returns entries where status is "pending" or "retry" AND
   * nextAttemptAt is <= the provided current timestamp.
   *
   * @param now - The current timestamp to compare against nextAttemptAt.
   * @param limit - Maximum number of entries to return.
   * @returns Outbox entries ready for retry, ordered by nextAttemptAt asc.
   */
  findDueForRetry(now: TimestampMs, limit: number): Promise<readonly OutboxEntry[]>;

  /**
   * Mark an outbox entry as successfully delivered.
   *
   * @param messageId - The message that was delivered.
   * @param deliveredAt - The timestamp of successful delivery.
   * @throws {RepositoryNotFoundError} If no outbox entry exists for the message.
   */
  markDelivered(messageId: MessageId, deliveredAt: TimestampMs): Promise<void>;

  /**
   * Record a failed delivery attempt and schedule a retry.
   *
   * Increments retryCount, computes the next retry time using the
   * RetryPolicy, and transitions the entry to "retry" status.
   * If the retry budget is exhausted, transitions to "failed".
   *
   * @param messageId - The message that failed.
   * @param error - Description of the failure reason.
   * @param failedAt - The timestamp of the failure.
   * @throws {RepositoryNotFoundError} If no outbox entry exists for the message.
   */
  markFailed(messageId: MessageId, error: string, failedAt: TimestampMs): Promise<void>;

  /**
   * Cancel a pending outbox entry.
   *
   * The entry is moved to "cancelled" status and will not be retried.
   *
   * @param messageId - The message to cancel delivery for.
   * @throws {RepositoryNotFoundError} If no outbox entry exists for the message.
   */
  cancel(messageId: MessageId): Promise<void>;

  /**
   * Purge completed outbox entries older than the given timestamp.
   *
   * Removes entries in "delivered" or "cancelled" status that were
   * completed before the specified threshold. Used for housekeeping
   * to prevent unbounded outbox growth.
   *
   * @param completedBefore - Purge entries completed before this timestamp.
   * @returns The number of entries purged.
   */
  purgeCompleted(completedBefore: TimestampMs): Promise<number>;
}

// ─── ConversationRepository ──────────────────────────────────────────────────

/**
 * Abstract repository for conversation metadata persistence.
 *
 * Stores conversation-level data: participant lists, unread counts,
 * last-message pointers, and timestamps. Does NOT store messages
 * themselves — use MessageRepository for that.
 *
 * @throws {RepositoryNotFoundError} - On operations targeting a missing conversation.
 * @throws {RepositoryConflictError} - On create when unique constraint violated.
 */
export interface ConversationRepository {
  /**
   * Create a new conversation.
   *
   * @param conversation - The conversation to create. Must not already exist.
   * @returns The persisted conversation.
   * @throws {RepositoryConflictError} If a conversation with the same ID exists.
   */
  save(conversation: Conversation): Promise<Conversation>;

  /**
   * Retrieve a conversation by its unique identifier.
   *
   * @param id - The ConversationId to look up.
   * @returns The conversation, or undefined if not found.
   */
  findById(id: ConversationId): Promise<Conversation | undefined>;

  /**
   * List conversations for a given participant with pagination.
   *
   * @param participantId - The user whose conversations to list.
   * @param pagination - Pagination strategy.
   * @param sort - Sort options. Defaults to updatedAt desc.
   * @param filter - Optional additional filters (hasUnread, updatedFrom).
   * @returns A paginated result of conversations.
   */
  findByParticipant(
    participantId: UserId,
    pagination: Pagination,
    sort?: SortOptions,
    filter?: ConversationFilter,
  ): Promise<PaginatedResult<Conversation>>;

  /**
   * Update conversation metadata.
   *
   * Used to update unreadCount, lastMessageId, updatedAt, and
   * participant lists (e.g., when adding/removing group members).
   *
   * @param id - The conversation to update.
   * @param updates - Partial set of fields to update.
   * @param expectedVersion - Optional version for optimistic locking.
   * @returns The updated conversation.
   * @throws {RepositoryNotFoundError} If the conversation does not exist.
   * @throws {RepositoryConcurrencyError} If the version does not match.
   */
  update(
    id: ConversationId,
    updates: Partial<Pick<Conversation, 'participantIds' | 'lastMessageId' | 'unreadCount' | 'updatedAt'>>,
    expectedVersion?: number,
  ): Promise<Conversation>;

  /**
   * Remove a conversation and all its messages.
   *
   * Implementations should cascade the delete to associated messages
   * in the MessageRepository, or use a database-level foreign key
   * constraint with ON DELETE CASCADE.
   *
   * @param id - The conversation to remove.
   * @throws {RepositoryNotFoundError} If the conversation does not exist.
   */
  delete(id: ConversationId): Promise<void>;

  /**
   * Atomically increment the unread count for a conversation.
   *
   * Thread-safe operation that ensures the count is accurate
   * even under concurrent message arrivals.
   *
   * @param conversationId - The conversation to increment.
   * @param delta - The amount to add (positive to increment, negative to decrement).
   * @throws {RepositoryNotFoundError} If the conversation does not exist.
   */
  incrementUnreadCount(conversationId: ConversationId, delta: number): Promise<void>;
}
