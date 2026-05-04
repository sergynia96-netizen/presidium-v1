/**
 * @author Сергей Карнаух <sergynia96@gmail.com>
 * @copyright (C) 2026 Сергей Карнаух. All Rights Reserved.
 *
 * @presidium/shared-messaging — Messaging Domain Contract
 *
 * Single entry point for all messaging domain types, errors, and state helpers.
 * This package defines the pure data layer for encrypted messaging —
 * no I/O, no crypto, no UI, no network. Just types, validation, and state transitions.
 */

// ─── IDs ─────────────────────────────────────────────────────────────────────
export type {
  UserId,
  DeviceId,
  ConversationId,
  MessageId,
  MessageClientNonce,
  TimestampMs,
} from './ids.js';

export {
  createUserId,
  createDeviceId,
  createConversationId,
  createMessageId,
  createMessageClientNonce,
  createTimestampMs,
} from './ids.js';

// ─── Domain Models ───────────────────────────────────────────────────────────
export type {
  DeliveryStatus,
  MessageDirection,
  MessageKind,
  EncryptedPayload,
  PlaintextDraft,
  MessageEnvelope,
  Conversation,
} from './message.js';

// ─── Delivery & Outbox ───────────────────────────────────────────────────────
export type {
  OutboxMessage,
  InboxMessage,
  OutboxStatus,
  OutboxEntry,
  RetryPolicy,
} from './delivery.js';

export {
  computeRetryDelay,
  DEFAULT_RETRY_POLICY,
} from './delivery.js';

// ─── Errors ──────────────────────────────────────────────────────────────────
export {
  MessagingDomainError,
  InvalidDeliveryTransitionError,
  DuplicateMessageError,
  InvalidConversationError,
  RepositoryNotFoundError,
  RepositoryConcurrencyError,
  RepositoryConflictError,
} from './errors.js';

// ─── State Helpers ───────────────────────────────────────────────────────────
export {
  canTransitionDeliveryStatus,
  transitionDeliveryStatus,
  markDelivered,
  markRead,
  createConversation,
  createOutboundEnvelope,
  registerInboundEnvelope,
  isDuplicateMessage,
} from './state.js';

// ─── Query Types ─────────────────────────────────────────────────────────────
export type {
  MessageSortField,
  SortDirection,
  SortOptions,
  MessageFilter,
  ConversationFilter,
  CursorPagination,
  OffsetPagination,
  Pagination,
  PaginatedResult,
} from './query.js';

// ─── Repository Interfaces ──────────────────────────────────────────────────
export type {
  MessageRepository,
  OutboxRepository,
  ConversationRepository,
} from './repository.js';
