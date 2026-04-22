/**
 * @author Presidium Maintainer
 * @copyright (C) 2026 Presidium Maintainer. All Rights Reserved.
 */

import { z } from 'zod';
import type { User, Chat, Message, Story, FeedPost, MarketplaceItem } from '@presidium/shared-types';

// === AUTH SCHEMAS ===
export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// === MESSAGE SCHEMAS ===
export const sendMessageSchema = z.object({
  chatId: z.string().uuid(),
  encryptedPayload: z.string().min(1),
  nonce: z.string().min(1),
  type: z.enum(['text', 'image', 'video', 'voice', 'file']).default('text'),
  replyTo: z.string().uuid().optional(),
});

export const readReceiptSchema = z.object({
  messageId: z.string().uuid(),
  chatId: z.string().uuid(),
});

// === STORY SCHEMAS ===
export const createStorySchema = z.object({
  type: z.enum(['text', 'image', 'video']),
  content: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  thumbnail: z.string().url().optional(),
  privacy: z.enum(['everyone', 'contacts', 'close-friends', 'custom']).default('contacts'),
  allowedUserIds: z.array(z.string().uuid()).optional(),
});

// === FEED SCHEMAS ===
export const createPostSchema = z.object({
  title: z.string().min(1).max(500),
  content: z.string().min(1).max(10000),
  topic: z.string().max(50).optional(),
  mediaUrls: z.array(z.string().url()).max(10).optional(),
});

export const feedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  topic: z.string().optional(),
});

// === MARKETPLACE SCHEMAS ===
export const createItemSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  price: z.coerce.number().min(0).default(0),
  category: z.string().min(1).max(50),
  images: z.array(z.string().url()).max(10).default([]),
  location: z.string().max(100).optional(),
});

// === CALL SCHEMAS ===
export const callSignalSchema = z.object({
  type: z.enum(['offer', 'answer', 'ice-candidate', 'hangup']),
  callId: z.string().uuid(),
  toUserId: z.string().uuid(),
  payload: z.unknown(),
});

// === API RESPONSE TYPES ===
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    cursor?: string | null;
    hasMore?: boolean;
    total?: number;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  meta: {
    cursor: string | null;
    hasMore: boolean;
    total: number;
  };
}
