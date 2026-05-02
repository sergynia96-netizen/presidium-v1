/**
 * @author Сергей Карнаух <sergynia96@gmail.com>
 * @copyright (C) 2026 Сергей Карнаух. All Rights Reserved.
 *
 * Domain-specific error types for the messaging layer.
 *
 * These are custom errors with structured data, intended for programmatic
 * handling by upper layers (UI, retry logic, telemetry).
 */

// ─── Base Error ──────────────────────────────────────────────────────────────

/**
 * Base error for all messaging domain errors.
 *
 * Upper layers can catch this to handle any messaging error generically,
 * or catch specific subclasses for targeted handling.
 */
export class MessagingDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessagingDomainError';
  }
}

// ─── Invalid Delivery Transition ─────────────────────────────────────────────

/**
 * Thrown when a delivery status transition violates the state machine.
 *
 * Example: trying to mark a "failed" message as "delivered",
 * or transitioning from "read" back to "sending".
 */
export class InvalidDeliveryTransitionError extends MessagingDomainError {
  public readonly from: string;
  public readonly to: string;

  constructor(from: string, to: string) {
    super(`Invalid delivery transition: ${from} -> ${to}`);
    this.name = 'InvalidDeliveryTransitionError';
    this.from = from;
    this.to = to;
  }
}

// ─── Duplicate Message ───────────────────────────────────────────────────────

/**
 * Thrown when a message with the same ID is registered more than once.
 *
 * This is a domain-level guard to prevent processing the same message
 * multiple times (e.g., due to network retransmission).
 */
export class DuplicateMessageError extends MessagingDomainError {
  public readonly messageId: string;

  constructor(messageId: string) {
    super(`Duplicate message: ${messageId}`);
    this.name = 'DuplicateMessageError';
    this.messageId = messageId;
  }
}

// ─── Invalid Conversation ────────────────────────────────────────────────────

/**
 * Thrown when a conversation cannot be created due to invalid input.
 *
 * Common cases: fewer than 2 participants, duplicate participant IDs.
 */
export class InvalidConversationError extends MessagingDomainError {
  public readonly reason: string;

  constructor(reason: string) {
    super(`Invalid conversation: ${reason}`);
    this.name = 'InvalidConversationError';
    this.reason = reason;
  }
}

// ─── Repository Errors ───────────────────────────────────────────────────────

/**
 * Thrown when a repository operation targets an entity that does not exist.
 *
 * Common scenarios:
 * - findById returns undefined, but caller expects existence.
 * - updateStatus / delete called on a non-existent message.
 * - markDelivered / cancel called on a non-existent outbox entry.
 */
export class RepositoryNotFoundError extends MessagingDomainError {
  /** The type of entity that was not found (e.g., "Message", "OutboxEntry", "Conversation"). */
  public readonly entityType: string;
  /** The identifier that was searched for. */
  public readonly entityId: string;

  constructor(entityType: string, entityId: string) {
    super(`${entityType} not found: ${entityId}`);
    this.name = 'RepositoryNotFoundError';
    this.entityType = entityType;
    this.entityId = entityId;
  }
}

/**
 * Thrown when a repository operation fails due to an optimistic locking conflict.
 *
 * This occurs when the caller provides an expectedVersion that does not match
 * the current version in storage, indicating that another process modified
 * the entity between the caller's read and write operations.
 *
 * The caller should re-read the entity, reconcile changes, and retry.
 */
export class RepositoryConcurrencyError extends MessagingDomainError {
  /** The type of entity with the version conflict. */
  public readonly entityType: string;
  /** The identifier of the conflicting entity. */
  public readonly entityId: string;
  /** The version the caller expected. */
  public readonly expectedVersion: number;
  /** The actual version currently stored. */
  public readonly actualVersion: number;

  constructor(
    entityType: string,
    entityId: string,
    expectedVersion: number,
    actualVersion: number,
  ) {
    super(
      `Concurrency conflict on ${entityType} ${entityId}: ` +
      `expected version ${expectedVersion}, got ${actualVersion}`,
    );
    this.name = 'RepositoryConcurrencyError';
    this.entityType = entityType;
    this.entityId = entityId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

/**
 * Thrown when a repository operation violates a unique constraint.
 *
 * Common scenarios:
 * - Saving a message with an ID that already exists.
 * - Enqueuing an outbox entry for a message already in the outbox.
 * - Creating a conversation with an ID that already exists.
 *
 * The caller should check for existence before retrying, or handle
 * the duplicate gracefully (e.g., return the existing entity).
 */
export class RepositoryConflictError extends MessagingDomainError {
  /** The type of entity with the unique constraint violation. */
  public readonly entityType: string;
  /** The identifier that caused the conflict. */
  public readonly entityId: string;
  /** Description of the constraint that was violated. */
  public readonly constraint: string;

  constructor(entityType: string, entityId: string, constraint: string) {
    super(
      `Conflict on ${entityType} ${entityId}: ${constraint}`,
    );
    this.name = 'RepositoryConflictError';
    this.entityType = entityType;
    this.entityId = entityId;
    this.constraint = constraint;
  }
}
