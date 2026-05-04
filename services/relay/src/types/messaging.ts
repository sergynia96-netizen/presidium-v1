/**
 * @author Сергей Карнаух <sergynia96@gmail.com>
 * @copyright (C) 2026 Сергей Карнаух. All Rights Reserved.
 *
 * Re-exports from @presidium/shared-messaging for use in relay.
 *
 * This is the single integration point between domain contract and infrastructure.
 *
 * RULES:
 * - Only re-export what relay actually needs.
 * - Don't add relay-specific logic here (use adapters for that).
 * - Keep this file sorted alphabetically within each section.
 * - Error classes use `export {}` (not `export type {}`) because they are
 *   runtime values needed for `throw` and `instanceof`.
 */

// ─── Branded IDs ─────────────────────────────────────────────────────────────
export type {
  ConversationId,
  DeviceId,
  MessageId,
  MessageClientNonce,
  TimestampMs,
  UserId,
} from '@presidium/shared-messaging';

export {
  createConversationId,
  createDeviceId,
  createMessageId,
  createMessageClientNonce,
  createTimestampMs,
  createUserId,
} from '@presidium/shared-messaging';

// ─── Domain Models ───────────────────────────────────────────────────────────
export type {
  Conversation,
  DeliveryStatus,
  EncryptedPayload,
  MessageDirection,
  MessageEnvelope,
  MessageKind,
  PlaintextDraft,
} from '@presidium/shared-messaging';

// ─── Delivery & Outbox ───────────────────────────────────────────────────────
export type {
  InboxMessage,
  OutboxEntry,
  OutboxMessage,
  OutboxStatus,
  RetryPolicy,
} from '@presidium/shared-messaging';

export {
  computeRetryDelay,
  DEFAULT_RETRY_POLICY,
} from '@presidium/shared-messaging';

// ─── Errors (runtime values — classes) ───────────────────────────────────────
export {
  DuplicateMessageError,
  InvalidConversationError,
  InvalidDeliveryTransitionError,
  MessagingDomainError,
  RepositoryConflictError,
  RepositoryConcurrencyError,
  RepositoryNotFoundError,
} from '@presidium/shared-messaging';

// ─── Query Types ─────────────────────────────────────────────────────────────
export type {
  ConversationFilter,
  CursorPagination,
  MessageFilter,
  MessageSortField,
  OffsetPagination,
  PaginatedResult,
  Pagination,
  SortDirection,
  SortOptions,
} from '@presidium/shared-messaging';

// ─── Repository Interfaces ──────────────────────────────────────────────────
export type {
  ConversationRepository,
  MessageRepository,
  OutboxRepository,
} from '@presidium/shared-messaging';

// ─── State Helpers (pure functions, no side effects) ─────────────────────────
export {
  canTransitionDeliveryStatus,
  createConversation,
  createOutboundEnvelope,
  isDuplicateMessage,
  markDelivered,
  markRead,
  registerInboundEnvelope,
  transitionDeliveryStatus,
} from '@presidium/shared-messaging';
