/**
 * @author Сергей Карнаух <sergynia96@gmail.com>
 * @copyright (C) 2026 Сергей Карнаух. All Rights Reserved.
 *
 * Branded ID types for the messaging domain.
 *
 * These are compile-time-only brands — no runtime overhead.
 * They prevent accidental mixing of different ID namespaces
 * (e.g., passing a UserId where a ConversationId is expected).
 */

/** Opaque brand key — never instantiated at runtime. */
declare const brand: unique symbol;

/**
 * Branded primitive wrapper.
 * T is the underlying type (typically string).
 * B is the brand identifier to distinguish types.
 */
type Brand<T, B extends string> = T & { readonly [brand]: B };

// ─── Domain ID Types ─────────────────────────────────────────────────────────

/** Unique identifier for a user account. */
export type UserId = Brand<string, 'UserId'>;

/** Unique identifier for a physical/logical device. */
export type DeviceId = Brand<string, 'DeviceId'>;

/** Unique identifier for a conversation (1:1 or group). */
export type ConversationId = Brand<string, 'ConversationId'>;

/** Unique identifier for a single message. */
export type MessageId = Brand<string, 'MessageId'>;

/** Client-generated nonce for idempotent message creation. */
export type MessageClientNonce = Brand<string, 'MessageClientNonce'>;

/** Unix epoch timestamp in milliseconds. */
export type TimestampMs = Brand<number, 'TimestampMs'>;

// ─── Constructor Helpers ─────────────────────────────────────────────────────

/**
 * Create a branded UserId. Does NOT validate the value —
 * the caller is responsible for providing a correct ID.
 */
export function createUserId(value: string): UserId {
  return value as UserId;
}

/** Create a branded DeviceId. */
export function createDeviceId(value: string): DeviceId {
  return value as DeviceId;
}

/** Create a branded ConversationId. */
export function createConversationId(value: string): ConversationId {
  return value as ConversationId;
}

/** Create a branded MessageId. */
export function createMessageId(value: string): MessageId {
  return value as MessageId;
}

/** Create a branded MessageClientNonce. */
export function createMessageClientNonce(value: string): MessageClientNonce {
  return value as MessageClientNonce;
}

/** Create a branded TimestampMs from a number. */
export function createTimestampMs(value: number): TimestampMs {
  return value as TimestampMs;
}
