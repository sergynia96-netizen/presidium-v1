/**
 * Tests for delivery types: OutboxEntry, RetryPolicy, computeRetryDelay.
 */

import { describe, it, expect } from 'vitest';

import {
  computeRetryDelay,
  DEFAULT_RETRY_POLICY,
} from '../delivery.js';

import type { RetryPolicy } from '../delivery.js';

import {
  createMessageId,
} from '../ids.js';

import {
  RepositoryNotFoundError,
  RepositoryConcurrencyError,
  RepositoryConflictError,
} from '../errors.js';

// ─── computeRetryDelay ──────────────────────────────────────────────────────

describe('computeRetryDelay', () => {
  it('returns baseDelayMs for the first retry (attempt 0)', () => {
    expect(computeRetryDelay(0, DEFAULT_RETRY_POLICY)).toBe(1000);
  });

  it('doubles the delay for each subsequent attempt', () => {
    expect(computeRetryDelay(1, DEFAULT_RETRY_POLICY)).toBe(2000);
    expect(computeRetryDelay(2, DEFAULT_RETRY_POLICY)).toBe(4000);
    expect(computeRetryDelay(3, DEFAULT_RETRY_POLICY)).toBe(8000);
    expect(computeRetryDelay(4, DEFAULT_RETRY_POLICY)).toBe(16000);
  });

  it('caps the delay at maxDelayMs', () => {
    // Attempt 5 would be 32000ms without cap, but max is 16000ms
    expect(computeRetryDelay(5, DEFAULT_RETRY_POLICY)).toBe(16000);
    // Even very high attempts are capped
    expect(computeRetryDelay(100, DEFAULT_RETRY_POLICY)).toBe(16000);
  });

  it('works with a custom retry policy', () => {
    const customPolicy: RetryPolicy = {
      baseDelayMs: 500,
      multiplier: 3,
      maxDelayMs: 10000,
      maxRetries: 10,
    };

    expect(computeRetryDelay(0, customPolicy)).toBe(500);
    expect(computeRetryDelay(1, customPolicy)).toBe(1500);
    expect(computeRetryDelay(2, customPolicy)).toBe(4500);
    // 13500 would exceed maxDelayMs of 10000
    expect(computeRetryDelay(3, customPolicy)).toBe(10000);
  });

  it('returns baseDelayMs for multiplier 1 (linear)', () => {
    const linearPolicy: RetryPolicy = {
      baseDelayMs: 2000,
      multiplier: 1,
      maxDelayMs: 5000,
      maxRetries: 3,
    };

    expect(computeRetryDelay(0, linearPolicy)).toBe(2000);
    expect(computeRetryDelay(1, linearPolicy)).toBe(2000);
    expect(computeRetryDelay(2, linearPolicy)).toBe(2000);
  });
});

// ─── DEFAULT_RETRY_POLICY ──────────────────────────────────────────────────

describe('DEFAULT_RETRY_POLICY', () => {
  it('has the expected default values', () => {
    expect(DEFAULT_RETRY_POLICY.baseDelayMs).toBe(1000);
    expect(DEFAULT_RETRY_POLICY.multiplier).toBe(2);
    expect(DEFAULT_RETRY_POLICY.maxDelayMs).toBe(16000);
    expect(DEFAULT_RETRY_POLICY.maxRetries).toBe(5);
  });

  it('has all readonly fields', () => {
    // TypeScript enforces this at compile time, but we verify runtime immutability
    const keys = Object.keys(DEFAULT_RETRY_POLICY) as (keyof RetryPolicy)[];
    expect(keys).toEqual(['baseDelayMs', 'multiplier', 'maxDelayMs', 'maxRetries']);
  });
});

// ─── RepositoryNotFoundError ────────────────────────────────────────────────

describe('RepositoryNotFoundError', () => {
  it('stores entity type and ID', () => {
    const err = new RepositoryNotFoundError('Message', 'msg-123');
    expect(err.name).toBe('RepositoryNotFoundError');
    expect(err.entityType).toBe('Message');
    expect(err.entityId).toBe('msg-123');
    expect(err.message).toBe('Message not found: msg-123');
  });

  it('is an instance of MessagingDomainError and Error', () => {
    const err = new RepositoryNotFoundError('OutboxEntry', 'msg-456');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RepositoryNotFoundError);
  });

  it('works with branded message IDs', () => {
    const id = createMessageId('msg-branded-1');
    const err = new RepositoryNotFoundError('Message', id as string);
    expect(err.entityId).toBe('msg-branded-1');
  });
});

// ─── RepositoryConcurrencyError ─────────────────────────────────────────────

describe('RepositoryConcurrencyError', () => {
  it('stores version conflict details', () => {
    const err = new RepositoryConcurrencyError('Message', 'msg-789', 3, 5);
    expect(err.name).toBe('RepositoryConcurrencyError');
    expect(err.entityType).toBe('Message');
    expect(err.entityId).toBe('msg-789');
    expect(err.expectedVersion).toBe(3);
    expect(err.actualVersion).toBe(5);
  });

  it('includes versions in the error message', () => {
    const err = new RepositoryConcurrencyError('Conversation', 'conv-1', 1, 2);
    expect(err.message).toContain('expected version 1');
    expect(err.message).toContain('got 2');
    expect(err.message).toContain('Conversation');
    expect(err.message).toContain('conv-1');
  });

  it('is an instance of MessagingDomainError and Error', () => {
    const err = new RepositoryConcurrencyError('X', 'y', 0, 1);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RepositoryConcurrencyError);
  });
});

// ─── RepositoryConflictError ───────────────────────────────────────────────

describe('RepositoryConflictError', () => {
  it('stores conflict details', () => {
    const err = new RepositoryConflictError(
      'Message',
      'msg-dup',
      'unique constraint: messages.id',
    );
    expect(err.name).toBe('RepositoryConflictError');
    expect(err.entityType).toBe('Message');
    expect(err.entityId).toBe('msg-dup');
    expect(err.constraint).toBe('unique constraint: messages.id');
  });

  it('includes all details in the error message', () => {
    const err = new RepositoryConflictError(
      'OutboxEntry',
      'msg-out-1',
      'unique constraint: outbox.message_id',
    );
    expect(err.message).toContain('OutboxEntry');
    expect(err.message).toContain('msg-out-1');
    expect(err.message).toContain('unique constraint: outbox.message_id');
  });

  it('is an instance of MessagingDomainError and Error', () => {
    const err = new RepositoryConflictError('X', 'y', 'z');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(RepositoryConflictError);
  });
});
