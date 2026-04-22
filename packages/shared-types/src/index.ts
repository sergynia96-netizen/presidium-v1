/**
 * @author Presidium Maintainer
 * @copyright (C) 2026 Presidium Maintainer. All Rights Reserved.
 */

// === CORE IDENTITY ===
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  status: 'online' | 'offline' | 'recently';
  publicKey: string;
  subscriptionTier: 'free' | 'local_ai' | 'cloud_ai';
  privacyTier: 'phantom' | 'guardian' | 'enterprise';
  strikes: number;
  createdAt: number;
}

// === E2EE ===
export interface EncryptedEnvelope {
  id: string;
  senderId: string;
  recipientId: string;
  encryptedContent: string;
  nonce: string;
  timestamp: number;
  signature: string;
}

// === CHAT ===
export type ChatType = 'private' | 'group' | 'channel' | 'secret';

export interface Chat {
  id: string;
  type: ChatType;
  name: string;
  avatar?: string;
  memberIds: string[];
  lastMessageAt?: number;
  unreadCount: number;
  isEncrypted: boolean;
  adminId?: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  encryptedPayload?: string;
  type: 'text' | 'image' | 'video' | 'voice' | 'file';
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  replyTo?: string;
  editedAt?: number;
  createdAt: number;
}

// === CALLS ===
export type CallType = 'audio' | 'video';

export interface CallSignal {
  type: 'offer' | 'answer' | 'ice-candidate' | 'hangup';
  callId: string;
  fromUserId: string;
  toUserId: string;
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit | null;
}

// === STORIES ===
export type StoryPrivacy = 'everyone' | 'contacts' | 'close-friends' | 'custom';

export interface Story {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  type: 'text' | 'image' | 'video';
  content?: string;
  mediaUrl?: string;
  thumbnail?: string;
  privacy: StoryPrivacy;
  allowedUserIds?: string[];
  views: number;
  replyCount: number;
  hasViewed: boolean;
  createdAt: number;
  expiresAt: number;
}

// === FEED ===
export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  title: string;
  content: string;
  topic?: string;
  mediaUrls?: string[];
  likes: number;
  dislikes: number;
  comments: number;
  repostCount: number;
  createdAt: number;
  isLiked?: boolean;
  isDisliked?: boolean;
}

// === MARKETPLACE ===
export interface MarketplaceItem {
  id: string;
  sellerId: string;
  sellerName: string;
  title: string;
  description: string;
  price: number;
  category: string;
  images: string[];
  location?: string;
  status: 'active' | 'sold' | 'removed';
  createdAt: number;
}

// === LIBRARY ===
export interface Book {
  id: string;
  title: string;
  author: string;
  description: string;
  coverUrl: string;
  fileUrl: string;
  price: number;
  category: string;
  uploaderId: string;
  createdAt: number;
}

// === MODERATION ===
export interface ModerationResult {
  violation: boolean;
  category: 'none' | 'toxicity' | 'fraud' | 'drugs' | 'violence' | 'spam';
  confidence: number;
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  source: 'regex' | 'onnx' | 'llm';
}

// === PRESENCE ===
export interface Presence {
  userId: string;
  status: 'online' | 'offline' | 'recently';
  lastSeen: number;
  deviceId?: string;
}

// === SUBSCRIPTION ===
export interface Subscription {
  userId: string;
  tier: 'free' | 'local_ai' | 'cloud_ai';
  expiresAt: number;
  paymentMethod?: string;
}

// === WS PROTOCOL ===
export type WsMessageType =
  | 'auth'
  | 'auth.success'
  | 'auth.error'
  | 'chat.message'
  | 'chat.read'
  | 'chat.typing'
  | 'call.signal'
  | 'story.update'
  | 'story.view'
  | 'presence.update'
  | 'presence.batch'
  | 'notification'
  | 'error';

export interface WsMessage<T = unknown> {
  type: WsMessageType;
  payload: T;
  timestamp: number;
}
