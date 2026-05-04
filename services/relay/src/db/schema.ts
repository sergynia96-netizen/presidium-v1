/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * Presidium Database Schema
 *
 * КРИТИЧЕСКИЕ ПРИНЦИПЫ:
 * 1. НЕТ поля content в messages — только encryptedPayload (E2EE blob)
 * 2. Metadata-only архитектура: сервер знает КТО, КОГДА, С КЕМ — но не ЧТО
 * 3. Guardian backups хранятся как opaque encrypted blobs
 * 4. Moderation работает по metadata (sender, frequency, patterns) — не по контенту
 * 5. Все foreign keys индексированы для JOIN performance
 * 6. UUIDv7 для primary keys (временная сортировка встроена)
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// === USERS ===

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    legacyWebUserId: text('legacy_web_user_id'),
    passwordHash: text('password_hash'),
    avatar: text('avatar'),
    publicKey: text('public_key').notNull(),
    encryptionKey: text('encryption_key'),
    subscriptionTier: varchar('subscription_tier', { length: 20 }).default('free').notNull(),
    privacyTier: varchar('privacy_tier', { length: 20 }).default('guardian').notNull(),
    strikes: integer('strikes').default(0).notNull(),
    status: varchar('status', { length: 20 }).default('active').notNull(),
    presenceStatus: varchar('presence_status', { length: 20 }).default('offline'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('users_email_idx').on(table.email),
    uniqueIndex('users_legacy_web_user_id_idx')
      .on(table.legacyWebUserId)
      .where(sql`${table.legacyWebUserId} IS NOT NULL`),
    index('users_status_idx').on(table.status),
    index('users_presence_idx').on(table.presenceStatus),
    index('users_created_idx').on(table.createdAt),
    index('users_presence_lastseen_idx').on(table.presenceStatus, table.lastSeenAt),
  ]
);

// === CHATS ===

export const chats = pgTable(
  'chats',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: varchar('type', { length: 20 }).notNull(), // 'private' | 'group' | 'channel' | 'secret'
    name: varchar('name', { length: 255 }),
    avatar: text('avatar'),
    isEncrypted: boolean('is_encrypted').default(true).notNull(),
    privatePairKey: text('private_pair_key'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ephemeralTimer: integer('ephemeral_timer').default(0),
    isPublic: boolean('is_public').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('chats_private_pair_key_idx')
      .on(table.privatePairKey)
      .where(sql`${table.privatePairKey} IS NOT NULL`),
    index('chats_type_idx').on(table.type),
    index('chats_created_idx').on(table.createdAt),
    index('chats_createdby_idx').on(table.createdBy),
  ]
);

// === CHAT MEMBERS ===

export const chatMembers = pgTable(
  'chat_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).default('member').notNull(),
    encryptedSenderKey: text('encrypted_sender_key'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    notificationsEnabled: boolean('notifications_enabled').default(true),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('chat_members_unique_idx').on(table.userId, table.chatId),
    index('chat_members_user_idx').on(table.userId),
    index('chat_members_chat_idx').on(table.chatId),
    index('chat_members_role_idx').on(table.role),
    index('chat_members_user_joined_idx').on(table.userId, table.joinedAt),
  ]
);

// === MESSAGES ===

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    chatId: uuid('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    encryptedPayload: text('encrypted_payload').notNull(),
    nonce: text('nonce').notNull(),
    type: varchar('type', { length: 20 }).default('text').notNull(),
    status: varchar('status', { length: 20 }).default('sent').notNull(),
    removedReason: varchar('removed_reason', { length: 50 }),
    replyTo: uuid('reply_to'),
    clientTimestamp: timestamp('client_timestamp', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('messages_chat_created_idx').on(table.chatId, table.createdAt),
    index('messages_chat_status_idx').on(table.chatId, table.status),
    index('messages_sender_idx').on(table.senderId),
    index('messages_created_idx').on(table.createdAt),
    index('messages_replyto_idx').on(table.replyTo),
    index('messages_expires_idx').on(table.expiresAt),
  ]
);

// === MESSAGE READ RECEIPTS ===

export const messageReads = pgTable(
  'message_reads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('message_reads_unique_idx').on(table.messageId, table.userId),
    index('message_reads_message_idx').on(table.messageId),
    index('message_reads_user_idx').on(table.userId),
  ]
);

// === OUTBOX ===

export const outbox = pgTable(
  'outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    recipientId: uuid('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).notNull().default('pending'),
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(5),
    enqueuedAt: timestamp('enqueued_at', { withTimezone: true }).notNull().defaultNow(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastError: text('last_error'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('outbox_status_next_attempt_idx')
      .on(table.status, table.nextAttemptAt)
      .where(sql`${table.status} IN ('pending', 'failed')`),
    index('outbox_message_id_idx').on(table.messageId),
    index('outbox_recipient_id_idx').on(table.recipientId),
    index('outbox_updated_at_idx').on(table.updatedAt),
  ]
);

// === STORIES ===

export const stories = pgTable(
  'stories',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    creatorId: uuid('creator_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 20 }).notNull(),
    content: text('content'),
    mediaUrl: text('media_url'),
    thumbnail: text('thumbnail'),
    privacy: varchar('privacy', { length: 20 }).default('contacts').notNull(),
    allowedUserIds: jsonb('allowed_user_ids').$type<string[]>(),
    replyPermission: varchar('reply_permission', { length: 20 }).default('everyone').notNull(),
    views: integer('views').default(0).notNull(),
    replyCount: integer('reply_count').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('stories_creator_idx').on(table.creatorId),
    index('stories_expires_idx').on(table.expiresAt),
    index('stories_privacy_idx').on(table.privacy),
    index('stories_expires_deleted_idx').on(table.expiresAt, table.deletedAt),
    index('stories_created_idx').on(table.createdAt),
  ]
);

// === STORY VIEWS ===

export const storyViews = pgTable(
  'story_views',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    storyId: uuid('story_id')
      .notNull()
      .references(() => stories.id, { onDelete: 'cascade' }),
    viewerId: uuid('viewer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    viewedAt: timestamp('viewed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('story_views_unique_idx').on(table.storyId, table.viewerId),
    index('story_views_story_idx').on(table.storyId),
    index('story_views_viewer_idx').on(table.viewerId),
  ]
);

// === FEED POSTS ===

export const feedPosts = pgTable(
  'feed_posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 500 }).notNull(),
    content: text('content').notNull(),
    topic: varchar('topic', { length: 50 }),
    mediaUrls: jsonb('media_urls').$type<string[]>(),
    likes: integer('likes').default(0).notNull(),
    dislikes: integer('dislikes').default(0).notNull(),
    comments: integer('comments').default(0).notNull(),
    repostCount: integer('repost_count').default(0).notNull(),
    algorithmicScore: integer('algorithmic_score').default(0),
    isRepost: boolean('is_repost').default(false).notNull(),
    originalPostId: uuid('original_post_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedReason: varchar('deleted_reason', { length: 50 }),
  },
  (table) => [
    index('feed_posts_author_idx').on(table.authorId),
    index('feed_posts_created_idx').on(table.createdAt),
    index('feed_posts_topic_idx').on(table.topic),
    index('feed_posts_score_idx').on(table.algorithmicScore, table.createdAt),
    index('feed_posts_deleted_idx').on(table.deletedAt),
  ]
);

// === FEED REACTIONS ===

export const feedReactions = pgTable(
  'feed_reactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .references(() => feedPosts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 10 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('feed_reactions_unique_idx').on(table.postId, table.userId),
    index('feed_reactions_post_idx').on(table.postId),
    index('feed_reactions_user_idx').on(table.userId),
  ]
);

// === FEED COMMENTS ===

export const feedComments = pgTable(
  'feed_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    postId: uuid('post_id')
      .notNull()
      .references(() => feedPosts.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    parentId: uuid('parent_id'),
    likes: integer('likes').default(0).notNull(),
    replies: integer('replies').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('feed_comments_post_idx').on(table.postId),
    index('feed_comments_parent_idx').on(table.parentId),
    index('feed_comments_author_idx').on(table.authorId),
    index('feed_comments_created_idx').on(table.createdAt),
  ]
);

// === MARKETPLACE ITEMS ===

export const marketplaceItems = pgTable(
  'marketplace_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sellerId: uuid('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description'),
    price: integer('price').default(0).notNull(),
    category: varchar('category', { length: 50 }).notNull(),
    images: jsonb('images').$type<string[]>(),
    location: varchar('location', { length: 100 }),
    status: varchar('status', { length: 20 }).default('active').notNull(),
    moderationStatus: varchar('moderation_status', { length: 20 }).default('pending').notNull(),
    views: integer('views').default(0).notNull(),
    contacts: integer('contacts').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('marketplace_category_idx').on(table.category),
    index('marketplace_status_idx').on(table.status),
    index('marketplace_seller_idx').on(table.sellerId),
    index('marketplace_price_idx').on(table.price),
    index('marketplace_location_idx').on(table.location),
    index('marketplace_search_idx').on(table.category, table.status, table.createdAt),
  ]
);

// === BOOKS ===

export const books = pgTable(
  'books',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    author: varchar('author', { length: 255 }),
    description: text('description'),
    coverUrl: text('cover_url'),
    fileUrl: text('file_url').notNull(),
    e2eKey: text('e2e_key'),
    price: integer('price').default(0).notNull(),
    category: varchar('category', { length: 50 }),
    format: varchar('format', { length: 10 }).default('pdf').notNull(),
    uploaderId: uuid('uploader_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    downloads: integer('downloads').default(0).notNull(),
    rating: integer('rating').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('books_category_idx').on(table.category),
    index('books_uploader_idx').on(table.uploaderId),
    index('books_price_idx').on(table.price),
    index('books_created_idx').on(table.createdAt),
  ]
);

// === CONTACTS ===

export const contacts = pgTable(
  'contacts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }),
    isFavorite: boolean('is_favorite').default(false),
    isBlocked: boolean('is_blocked').default(false),
    category: varchar('category', { length: 20 }).default('contacts').notNull(),
    privacyTags: text('privacy_tags').array(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('contacts_unique_idx').on(table.userId, table.contactId),
    index('contacts_user_idx').on(table.userId),
    index('contacts_contact_idx').on(table.contactId),
    index('contacts_favorite_idx').on(table.userId, table.isFavorite),
  ]
);

// === MODERATION REPORTS ===

export const moderationReports = pgTable(
  'moderation_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    targetType: varchar('target_type', { length: 20 }).notNull(),
    targetId: uuid('target_id').notNull(),
    senderId: uuid('sender_id').references(() => users.id, { onDelete: 'set null' }),
    source: varchar('source', { length: 20 }).notNull(),
    riskLevel: varchar('risk_level', { length: 20 }).notNull(),
    flags: jsonb('flags'),
    reason: text('reason'),
    latencyMs: integer('latency_ms'),
    action: varchar('action', { length: 20 }).default('none').notNull(),
    reviewedBy: uuid('reviewed_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('moderation_target_idx').on(table.targetType, table.targetId),
    index('moderation_sender_idx').on(table.senderId),
    index('moderation_source_idx').on(table.source),
    index('moderation_risk_idx').on(table.riskLevel),
    index('moderation_created_idx').on(table.createdAt),
  ]
);

// === GUARDIAN BACKUPS ===

export const guardianBackups = pgTable(
  'guardian_backups',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' })
      .unique(),
    backupId: uuid('backup_id').notNull().unique(),
    encryptedBlob: text('encrypted_blob').notNull(),
    nonce: text('nonce').notNull(),
    salt: text('salt').notNull(),
    checksum: text('checksum').notNull(),
    serverShard: text('server_shard').notNull(),
    escrowShard: text('escrow_shard').notNull(),
    deviceId: text('device_id').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    schemaVersion: integer('schema_version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('guardian_user_idx').on(table.userId),
    index('guardian_backup_idx').on(table.backupId),
    index('guardian_created_idx').on(table.createdAt),
  ]
);

// === SESSIONS ===

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    deviceId: text('device_id').notNull(),
    deviceName: text('device_name'),
    deviceType: varchar('device_type', { length: 20 }),
    ipAddress: varchar('ip_address', { length: 45 }),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revoked: boolean('revoked').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('sessions_token_idx').on(table.refreshTokenHash),
    index('sessions_user_idx').on(table.userId),
    index('sessions_device_idx').on(table.deviceId),
    index('sessions_expires_idx').on(table.expiresAt),
  ]
);

// === SUBSCRIPTIONS ===

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tier: varchar('tier', { length: 20 }).notNull(),
    provider: varchar('provider', { length: 20 }).notNull(),
    externalId: text('external_id'),
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 3 }).default('RUB'),
    status: varchar('status', { length: 20 }).default('active').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    autoRenew: boolean('auto_renew').default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('subscriptions_user_idx').on(table.userId),
    index('subscriptions_status_idx').on(table.status),
    index('subscriptions_expires_idx').on(table.expiresAt),
  ]
);

// === RELATIONS ===

export const usersRelations = relations(users, ({ many }) => ({
  chats: many(chatMembers),
  stories: many(stories),
  posts: many(feedPosts),
  items: many(marketplaceItems),
  contacts: many(contacts),
  sessions: many(sessions),
  backups: many(guardianBackups),
}));

export const chatsRelations = relations(chats, ({ many, one }) => ({
  members: many(chatMembers),
  messages: many(messages),
  creator: one(users, {
    fields: [chats.createdBy],
    references: [users.id],
  }),
}));

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  user: one(users, {
    fields: [chatMembers.userId],
    references: [users.id],
  }),
  chat: one(chats, {
    fields: [chatMembers.chatId],
    references: [chats.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id],
  }),
  sender: one(users, {
    fields: [messages.senderId],
    references: [users.id],
  }),
  readReceipts: many(messageReads),
  outboxEntries: many(outbox),
}));

export const outboxRelations = relations(outbox, ({ one }) => ({
  message: one(messages, {
    fields: [outbox.messageId],
    references: [messages.id],
  }),
  recipient: one(users, {
    fields: [outbox.recipientId],
    references: [users.id],
  }),
}));

export const storiesRelations = relations(stories, ({ one, many }) => ({
  creator: one(users, {
    fields: [stories.creatorId],
    references: [users.id],
  }),
  views: many(storyViews),
}));

export const feedPostsRelations = relations(feedPosts, ({ one, many }) => ({
  author: one(users, {
    fields: [feedPosts.authorId],
    references: [users.id],
  }),
  reactions: many(feedReactions),
  comments: many(feedComments),
}));

// keep sql imported for future computed columns in migrations
void sql;
