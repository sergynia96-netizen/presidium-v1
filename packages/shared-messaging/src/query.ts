/**
 * @author Сергей Карнаух <sergynia96@gmail.com>
 * @copyright (C) 2026 Сергей Карнаух. All Rights Reserved.
 *
 * Query types for repository layer.
 *
 * Provides pagination (cursor-based and offset-based), filtering,
 * and sorting abstractions used by all repository interfaces.
 *
 * DESIGN DECISIONS:
 * - Cursor-based pagination is the primary strategy for real-time
 *   message feeds (stable under inserts, no page skips).
 * - Offset-based pagination is provided for admin/audit queries
 *   where absolute position matters more than performance.
 * - All fields are readonly to enforce immutability at the type level.
 */

import type {
  ConversationId,
  MessageId,
  UserId,
  TimestampMs,
} from './ids.js';

import type { DeliveryStatus, MessageKind } from './message.js';

// ─── Sort ────────────────────────────────────────────────────────────────────

/**
 * Fields available for sorting message queries.
 *
 * Each value maps to a physical column or computed field in the
 * underlying storage engine. The repository implementation is
 * responsible for translating these to the appropriate query.
 */
export type MessageSortField =
  | 'createdAt'
  | 'updatedAt'
  | 'deliveryStatus'
  | 'kind';

/**
 * Sort direction — ascending or descending.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Generic sort descriptor for ordered queries.
 *
 * @typeParam T - The specific sort field enum or union type.
 *   Use MessageSortField for message queries, or extend
 *   with domain-specific fields for other entities.
 */
export interface SortOptions<T extends string = MessageSortField> {
  /** The field to sort by. */
  readonly field: T;
  /** Sort direction — defaults to 'desc' (newest first for timestamps). */
  readonly direction: SortDirection;
}

// ─── Filters ─────────────────────────────────────────────────────────────────

/**
 * Filter criteria for message listing queries.
 *
 * All fields are optional — omitted fields are not applied.
 * Multiple fields are combined with AND logic.
 */
export interface MessageFilter {
  /** Only messages in this conversation. */
  readonly conversationId?: ConversationId;
  /** Only messages from this sender. */
  readonly senderId?: UserId;
  /** Only messages with this delivery status. */
  readonly deliveryStatus?: DeliveryStatus;
  /** Only messages of this kind (text, media, system). */
  readonly kind?: MessageKind;
  /** Only messages created at or after this timestamp (inclusive). */
  readonly createdFrom?: TimestampMs;
  /** Only messages created at or before this timestamp (inclusive). */
  readonly createdTo?: TimestampMs;
}

/**
 * Filter criteria for conversation listing queries.
 *
 * All fields are optional — omitted fields are not applied.
 */
export interface ConversationFilter {
  /** Only conversations containing this participant. */
  readonly participantId?: UserId;
  /** Only conversations with unread count greater than zero. */
  readonly hasUnread?: boolean;
  /** Only conversations updated at or after this timestamp (inclusive). */
  readonly updatedFrom?: TimestampMs;
}

// ─── Pagination ──────────────────────────────────────────────────────────────

/**
 * Cursor-based pagination parameters.
 *
 * The cursor is an opaque string encoding the position of the last
 * item in the previous page. For message feeds, this is typically
 * the message ID or (createdAt, id) tuple, ensuring stable ordering
 * even when new messages are inserted between page fetches.
 *
 * Cursor pagination is the recommended strategy for:
 * - Real-time message feeds
 * - Infinite scroll UIs
 * - Any dataset with frequent inserts
 */
export interface CursorPagination {
  readonly type: 'cursor';
  /**
   * Opaque cursor from a previous PaginatedResult.
   * Absent or undefined means "start from the beginning".
   */
  readonly cursor?: string;
  /** Maximum number of items to return. Must be >= 1. */
  readonly limit: number;
}

/**
 * Offset-based pagination parameters.
 *
 * Uses a numeric offset into the result set. Simpler than cursor
 * pagination but suffers from stability issues when items are
 * inserted or deleted between page fetches (page drift).
 *
 * Recommended for:
 * - Admin / audit queries where absolute position matters
 * - Export/batch processing where consistency is less critical
 */
export interface OffsetPagination {
  readonly type: 'offset';
  /** Zero-based offset into the result set. */
  readonly offset: number;
  /** Maximum number of items to return. Must be >= 1. */
  readonly limit: number;
}

/**
 * Discriminated union of all pagination strategies.
 *
 * Use this type in repository method signatures to accept either
 * pagination mode without overloading.
 */
export type Pagination = CursorPagination | OffsetPagination;

// ─── Paginated Result ────────────────────────────────────────────────────────

/**
 * A page of results from a paginated query.
 *
 * Contains the items for the current page plus metadata for
 * navigating to the next page. The cursor is an opaque string
 * — consumers should NOT parse or construct cursors manually.
 *
 * @typeParam T - The type of items in the result set.
 */
export interface PaginatedResult<T> {
  /** Items on the current page. */
  readonly items: readonly T[];
  /**
   * Cursor for the next page.
   * Absent if there are no more results (end of list).
   */
  readonly nextCursor?: string;
  /**
   * Whether more results exist beyond this page.
   * Convenience flag — equivalent to checking nextCursor !== undefined.
   */
  readonly hasMore: boolean;
  /** Total number of items matching the filter (may be approximate for large datasets). */
  readonly totalCount?: number;
}
