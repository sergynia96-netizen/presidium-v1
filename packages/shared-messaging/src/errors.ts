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
