/**
 * @author Сергей Карнаух <sergynia96@gmail.com>
 * @copyright (C) 2026 Сергей Карнаух. All Rights Reserved.
 *
 * DrizzleOutboxRepository — PostgreSQL implementation of OutboxRepository.
 *
 * Implements the domain contract from @presidium/shared-messaging
 * using Drizzle ORM and the outbox table defined in schema.ts.
 *
 * DESIGN NOTES:
 * - The domain OutboxEntry does not include recipientId, but the DB table
 *   requires it (NOT NULL). Callers must pass an OutboxEnqueueOptions with
 *   recipientId when calling enqueue().
 * - The domain OutboxStatus includes 'retry' while the SQL migration CHECK
 *   constraint currently includes 'sent' instead of 'retry'. A future
 *   migration will reconcile this. The repository writes domain-correct
 *   status values ('retry'); the DB constraint needs updating separately.
 * - TimestampMs (branded number) ↔ Date conversions happen at the
 *   repository boundary. Domain code never sees Date objects.
 * - Branded types (MessageId, UserId, TimestampMs) are cast at the
 *   repository boundary since the DB stores plain strings/numbers.
 */

import type { OutboxRepository } from '../../types/messaging.js';
import type {
  OutboxEntry,
  OutboxStatus,
  MessageId,
  TimestampMs,
  UserId,
} from '../../types/messaging.js';
import {
  computeRetryDelay,
  DEFAULT_RETRY_POLICY,
  RepositoryNotFoundError,
} from '../../types/messaging.js';

import { outbox } from '../schema.js';
import { eq, and, lte, inArray, asc, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

// ─── Constructor Options ─────────────────────────────────────────────────────

/**
 * Additional options for enqueue(), providing DB-specific fields
 * that the domain OutboxEntry does not carry.
 */
export interface OutboxEnqueueOptions {
  /** The recipient of this delivery attempt. Required by the DB schema (NOT NULL). */
  recipientId: UserId;
  /**
   * Maximum number of retry attempts before giving up.
   * Stored per-row so individual messages can have custom retry budgets.
   * Defaults to DEFAULT_RETRY_POLICY.maxRetries (5).
   */
  maxRetries?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a TimestampMs (branded number) to a JavaScript Date.
 * Safe to pass undefined → returns null for nullable DB columns.
 */
function toDate(ms: TimestampMs | undefined): Date | null {
  return ms !== undefined ? new Date(ms) : null;
}

/**
 * Convert a JavaScript Date (or null) to a TimestampMs (branded number) or undefined.
 */
function toTimestampMs(date: Date | null): TimestampMs | undefined {
  return date !== null ? (date.getTime() as unknown as TimestampMs) : undefined;
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * PostgreSQL-backed implementation of the OutboxRepository domain contract.
 *
 * Accepts a Drizzle database instance via constructor injection so that
 * tests can provide a mock or in-memory alternative.
 */
export class DrizzleOutboxRepository implements OutboxRepository {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly db: PostgresJsDatabase<any>) {}

  // ── enqueue ──────────────────────────────────────────────────────────────

  /**
   * Insert a new outbox entry for delivery tracking.
   *
   * The domain OutboxEntry does not carry recipientId or maxRetries.
   * Pass them via the optional second parameter (OutboxEnqueueOptions).
   * Without recipientId the insert will fail (DB NOT NULL constraint).
   */
  async enqueue(entry: OutboxEntry, options?: OutboxEnqueueOptions): Promise<OutboxEntry> {
    if (!options?.recipientId) {
      throw new Error(
        'DrizzleOutboxRepository.enqueue() requires options.recipientId. ' +
        'The domain OutboxEntry does not include a recipient field, ' +
        'but the outbox table has recipient_id NOT NULL.',
      );
    }

    const [row] = await this.db
      .insert(outbox)
      .values({
        messageId: entry.messageId as string,
        recipientId: options.recipientId as string,
        status: entry.status,
        retryCount: entry.retryCount,
        maxRetries: options.maxRetries ?? DEFAULT_RETRY_POLICY.maxRetries,
        enqueuedAt: new Date(entry.enqueuedAt),
        nextAttemptAt: toDate(entry.nextAttemptAt),
        lastAttemptAt: toDate(entry.lastAttemptAt),
        lastError: entry.lastError ?? null,
        version: entry.version,
      })
      .returning();

    return mapRowToEntry(row!);
  }

  // ── findByMessageId ─────────────────────────────────────────────────────

  async findByMessageId(messageId: MessageId): Promise<OutboxEntry | undefined> {
    const [row] = await this.db
      .select()
      .from(outbox)
      .where(eq(outbox.messageId, messageId as string))
      .limit(1);

    return row ? mapRowToEntry(row) : undefined;
  }

  // ── findDueForRetry ─────────────────────────────────────────────────────

  /**
   * List outbox entries eligible for delivery or retry.
   *
   * Matches rows where status is 'pending' or 'retry' AND either:
   * - nextAttemptAt IS NULL (first attempt — immediate delivery), OR
   * - nextAttemptAt <= the provided timestamp (retry is due).
   *
   * Results are ordered by nextAttemptAt ASC so the worker processes
   * the most overdue entries first.
   */
  async findDueForRetry(now: TimestampMs, limit: number): Promise<readonly OutboxEntry[]> {
    const rows = await this.db
      .select()
      .from(outbox)
      .where(
        and(
          inArray(outbox.status, ['pending', 'retry'] as OutboxStatus[]),
          sql`(${outbox.nextAttemptAt} IS NULL OR ${outbox.nextAttemptAt} <= ${new Date(now)})`,
        ),
      )
      .orderBy(asc(outbox.nextAttemptAt))
      .limit(limit);

    return rows.map((row: typeof outbox.$inferSelect) => mapRowToEntry(row));
  }

  // ── markDelivered ───────────────────────────────────────────────────────

  /**
   * Mark an outbox entry as successfully delivered.
   *
   * Sets status to 'delivered', records completedAt, and bumps the
   * version for optimistic locking.
   *
   * @throws {RepositoryNotFoundError} If no outbox row exists for the messageId.
   */
  async markDelivered(messageId: MessageId, deliveredAt: TimestampMs): Promise<void> {
    const [updated] = await this.db
      .update(outbox)
      .set({
        status: 'delivered',
        completedAt: new Date(deliveredAt),
        updatedAt: new Date(),
        version: sql`${outbox.version} + 1`,
      })
      .where(eq(outbox.messageId, messageId as string))
      .returning();

    if (!updated) {
      throw new RepositoryNotFoundError('OutboxEntry', messageId);
    }
  }

  // ── markFailed ──────────────────────────────────────────────────────────

  /**
   * Record a delivery failure and optionally schedule a retry.
   *
   * 1. Reads the current row to inspect retryCount vs maxRetries.
   * 2. Increments retryCount.
   * 3. If retry budget exhausted → status 'failed', completedAt = failedAt.
   * 4. If retries remain → status 'retry', compute nextAttemptAt via
   *    exponential backoff (computeRetryDelay).
   *
   * @throws {RepositoryNotFoundError} If no outbox row exists for the messageId.
   */
  async markFailed(messageId: MessageId, error: string, failedAt: TimestampMs): Promise<void> {
    // Read current state to determine retry budget
    const [current] = await this.db
      .select()
      .from(outbox)
      .where(eq(outbox.messageId, messageId as string))
      .limit(1);

    if (!current) {
      throw new RepositoryNotFoundError('OutboxEntry', messageId);
    }

    const newRetryCount = current.retryCount + 1;
    const exhausted = newRetryCount >= current.maxRetries;

    const nextAttemptAt = exhausted
      ? null
      : new Date(failedAt + computeRetryDelay(newRetryCount - 1, DEFAULT_RETRY_POLICY));

    await this.db
      .update(outbox)
      .set({
        status: exhausted ? 'failed' : 'retry',
        retryCount: newRetryCount,
        lastAttemptAt: new Date(failedAt),
        lastError: error,
        nextAttemptAt,
        completedAt: exhausted ? new Date(failedAt) : null,
        updatedAt: new Date(),
        version: sql`${outbox.version} + 1`,
      })
      .where(eq(outbox.messageId, messageId as string));
  }

  // ── cancel ──────────────────────────────────────────────────────────────

  /**
   * Cancel a pending or retry-scheduled outbox entry.
   *
   * Sets status to 'cancelled', records completedAt, and bumps version.
   * Cancelled entries can be purged via purgeCompleted().
   *
   * @throws {RepositoryNotFoundError} If no outbox row exists for the messageId.
   */
  async cancel(messageId: MessageId): Promise<void> {
    const [updated] = await this.db
      .update(outbox)
      .set({
        status: 'cancelled',
        completedAt: new Date(),
        updatedAt: new Date(),
        version: sql`${outbox.version} + 1`,
      })
      .where(eq(outbox.messageId, messageId as string))
      .returning();

    if (!updated) {
      throw new RepositoryNotFoundError('OutboxEntry', messageId);
    }
  }

  // ── purgeCompleted ──────────────────────────────────────────────────────

  /**
   * Delete outbox entries in terminal states that were completed
   * before the given threshold timestamp.
   *
   * Removes rows where status is 'delivered' or 'cancelled' AND
   * completedAt <= completedBefore. Returns the number of purged rows.
   *
   * This is a housekeeping operation to prevent unbounded outbox growth.
   */
  async purgeCompleted(completedBefore: TimestampMs): Promise<number> {
    const deleted = await this.db
      .delete(outbox)
      .where(
        and(
          inArray(outbox.status, ['delivered', 'cancelled'] as OutboxStatus[]),
          sql`${outbox.completedAt} IS NOT NULL AND ${outbox.completedAt} <= ${new Date(completedBefore)}`,
        ),
      )
      .returning({ id: outbox.id });

    return deleted.length;
  }
}

// ─── Row Mapping ──────────────────────────────────────────────────────────────

/**
 * Map a Drizzle outbox row to a domain OutboxEntry.
 *
 * Handles:
 * - Branded type casts (MessageId, TimestampMs)
 * - Date → number conversions for temporal fields
 * - null → undefined for optional fields
 */
function mapRowToEntry(row: typeof outbox.$inferSelect): OutboxEntry {
  return {
    messageId: row.messageId as unknown as MessageId,
    status: row.status as OutboxStatus,
    retryCount: row.retryCount,
    enqueuedAt: new Date(row.enqueuedAt).getTime() as unknown as TimestampMs,
    lastAttemptAt: toTimestampMs(row.lastAttemptAt),
    nextAttemptAt: toTimestampMs(row.nextAttemptAt),
    completedAt: toTimestampMs(row.completedAt),
    lastError: row.lastError ?? undefined,
    version: row.version,
  };
}
