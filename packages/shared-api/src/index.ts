/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */

import { z } from 'zod';
import type { User, Chat, Message, Story, FeedPost, MarketplaceItem, Book } from '@presidium/shared-types';

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
  clientTimestamp: z.number().optional(),
  id: z.string().uuid().optional(),
});

export const readReceiptSchema = z.object({
  messageId: z.string().uuid(),
  chatId: z.string().uuid(),
});

// === CHAT SCHEMAS ===
export const createChatSchema = z.object({
  type: z.enum(['private', 'group', 'channel', 'secret']).default('private'),
  name: z.string().max(255).optional(),
  memberIds: z.array(z.string().uuid()).min(1),
  isEncrypted: z.boolean().default(true),
});

export const updateChatSchema = z.object({
  name: z.string().max(255).optional(),
  avatar: z.string().url().optional(),
  ephemeralTimer: z.number().min(0).max(604800).optional(),
});

// === STORY SCHEMAS ===
export const createStorySchema = z.object({
  type: z.enum(['text', 'image', 'video']),
  content: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  thumbnail: z.string().url().optional(),
  privacy: z.enum(['everyone', 'contacts', 'close-friends', 'custom']).default('contacts'),
  allowedUserIds: z.array(z.string().uuid()).optional(),
  replyPermission: z.enum(['everyone', 'contacts', 'none']).default('everyone'),
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
  authorId: z.string().uuid().optional(),
});

export const reactToPostSchema = z.object({
  type: z.enum(['like', 'dislike']),
});

export const commentOnPostSchema = z.object({
  content: z.string().min(1).max(2000),
  parentId: z.string().uuid().optional(),
});

// === MARKETPLACE SCHEMAS ===
export const createItemSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional(),
  price: z.coerce.number().min(0).default(0),
  category: z.enum(['electronics', 'services', 'real_estate', 'auto', 'jobs', 'other']),
  images: z.array(z.string().url()).max(10).default([]),
  location: z.string().max(100).optional(),
});

export const updateItemSchema = createItemSchema.partial();

export const marketplaceQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  category: z.enum(['electronics', 'services', 'real_estate', 'auto', 'jobs', 'other']).optional(),
  search: z.string().max(100).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
});

// === BOOK / LIBRARY SCHEMAS ===
export const createBookSchema = z.object({
  title: z.string().min(1).max(255),
  author: z.string().max(255),
  description: z.string().max(5000).optional(),
  coverUrl: z.string().url().optional(),
  fileUrl: z.string().url().min(1),
  price: z.coerce.number().min(0).default(0),
  category: z.string().max(50),
  format: z.enum(['pdf', 'epub', 'fb2', 'audio']).default('pdf'),
});

export const bookQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  category: z.string().max(50).optional(),
  search: z.string().max(100).optional(),
  sort: z.enum(['newest', 'popular', 'rating', 'price_asc']).default('newest'),
});

// === SUBSCRIPTION SCHEMAS ===
export const createSubscriptionSchema = z.object({
  tier: z.enum(['free', 'local_ai', 'cloud_ai']),
  provider: z.enum(['stripe', 'cloudpayments', 'manual']).default('manual'),
});

export const cancelSubscriptionSchema = z.object({
  reason: z.string().max(500).optional(),
});

// === CALL SCHEMAS ===
export const callSignalSchema = z.object({
  type: z.enum(['offer', 'answer', 'ice-candidate', 'hangup']),
  callId: z.string().uuid(),
  toUserId: z.string().uuid(),
  payload: z.unknown(),
});

// === ADMIN SCHEMAS ===
export const adminUsersQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['active', 'banned', 'all']).default('all'),
  search: z.string().max(100).optional(),
});

export const adminStrikeSchema = z.object({
  action: z.enum(['add', 'remove', 'reset']),
  reason: z.string().max(500).optional(),
});

export const adminBanSchema = z.object({
  banned: z.boolean(),
  reason: z.string().max(500).optional(),
});

export const adminReviewSchema = z.object({
  action: z.enum(['approve', 'reject', 'escalate']),
  note: z.string().max(1000).optional(),
});

// === PRESENCE SCHEMAS ===
export const typingSchema = z.object({
  chatId: z.string().uuid(),
});

// === CONTACT SCHEMAS ===
export const addContactSchema = z.object({
  contactId: z.string().uuid(),
  name: z.string().max(255).optional(),
});

// === GUARDIAN BACKUP SCHEMAS ===
export const createBackupSchema = z.object({
  encryptedBlob: z.string().min(1),
  nonce: z.string().min(1),
  salt: z.string().min(1),
  checksum: z.string().min(1),
  deviceId: z.string().min(1),
  sizeBytes: z.number().min(1),
});

export const restoreBackupSchema = z.object({
  backupId: z.string().uuid(),
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

// === SUBSCRIPTION TIERS ===
export interface SubscriptionTier {
  id: 'free' | 'local_ai' | 'cloud_ai';
  name: string;
  price: number;
  currency: string;
  features: string[];
  aiTokens: number;
  maxGroupSize: number;
  maxFileSize: number;
  prioritySupport: boolean;
}

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    id: 'free',
    name: 'Бесплатный',
    price: 0,
    currency: 'RUB',
    features: ['E2EE шифрование', 'Групповые чаты до 20 участников', 'Истории', 'Лента', 'Маркетплейс', 'Библиотека'],
    aiTokens: 0,
    maxGroupSize: 20,
    maxFileSize: 25 * 1024 * 1024,
    prioritySupport: false,
  },
  {
    id: 'local_ai',
    name: 'Local AI',
    price: 299,
    currency: 'RUB',
    features: ['Всё из Бесплатного', 'AI модерация (локальная)', 'AI помощник в чате', 'Расширенная модерация', 'Приоритетная поддержка', 'Группы до 100'],
    aiTokens: 10000,
    maxGroupSize: 100,
    maxFileSize: 100 * 1024 * 1024,
    prioritySupport: true,
  },
  {
    id: 'cloud_ai',
    name: 'Cloud AI',
    price: 699,
    currency: 'RUB',
    features: ['Всё из Local AI', 'Cloud AI помощник (GLM-4)', 'AI генерация контента', 'Расширенная аналитика', 'Эксклюзивные эмодзи', 'Группы до 500', 'Secret Channels', 'Голосовой AI'],
    aiTokens: 100000,
    maxGroupSize: 500,
    maxFileSize: 500 * 1024 * 1024,
    prioritySupport: true,
  },
];

// === ERROR CODES ===
export const ErrorCode = {
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_ACCOUNT_BANNED: 'AUTH_ACCOUNT_BANNED',
  AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];
