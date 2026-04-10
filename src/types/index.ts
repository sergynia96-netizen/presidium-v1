export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  status: 'online' | 'away' | 'offline';
  pinEnabled: boolean;
  bio?: string;
  username?: string;
  phone?: string;
  birthday?: string;
}

export interface Chat {
  id: string;
  type: 'private' | 'group' | 'ai';
  name: string;
  avatar: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  notificationLevel?: 'all' | 'mentions' | 'muted';
  isEncrypted: boolean;
  encryptionType?: 'e2e' | 'p2p' | 'server';
  role?: 'owner' | 'admin' | 'moderator' | 'member' | 'restricted';
  online?: boolean;
  members?: string[];
  isArchived?: boolean;
  wallpaper?: string;
}

export interface ChatFolder {
  id: string;
  name: string;
  chatIds: string[];
  icon?: string;
}

export interface MessageReplyPreview {
  id: string;
  senderName: string;
  content: string;
  type: 'text' | 'system' | 'ai' | 'openclaw' | 'voice' | 'video-circle' | 'media';
}

export interface MessageForwardPreview {
  id: string;
  senderName: string;
  content: string;
  type: 'text' | 'system' | 'ai' | 'openclaw' | 'voice' | 'video-circle' | 'media';
  fromChatName?: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  timestamp: string;
  type: 'text' | 'system' | 'ai' | 'openclaw' | 'voice' | 'video-circle' | 'media';
  status: 'read' | 'delivered' | 'sent' | 'sending';
  isMe: boolean;
  aiActions?: string[];
  openClawActions?: string[];
  moderationFlags?: Array<{
    category: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
  }>;
  mediaUrl?: string;
  mediaType?: 'image' | 'file' | 'audio';
  mediaName?: string;
  mediaSize?: number;
  mediaMimeType?: string;
  e2eMedia?: { key: string; iv: string; tag: string };
  isPinned?: boolean;
  isEdited?: boolean;
  editHistory?: Array<{
    content: string;
    editedAt: string;
    editorId?: string;
  }>;
  replyTo?: MessageReplyPreview;
  forwardedFrom?: MessageForwardPreview;
  quoteSegment?: {
    label: string;
    note?: string;
  };
  createdAt?: string;
  updatedAt?: string;
  silent?: boolean;
  isDeleted?: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deletedForEveryone?: boolean;
  readBy?: string[];
  anonymousAdmin?: boolean;
}

export interface FeedPost {
  id: string;
  channelName: string;
  channelAvatar: string;
  title: string;
  content: string;
  timestamp: string;
  likes: number;
  dislikes?: number;
  comments: number;
  commentList?: FeedComment[];
  isLiked?: boolean;
  isDisliked?: boolean;
  isReposted?: boolean;
  authorId?: string;
  repostCount?: number;
}

export interface FeedComment {
  id: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  timestamp: string;
  likes: number;
}

export interface AIConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AIConversation {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  messages?: AIConversationMessage[];
  mode?: string;
}

export interface Contact {
  id: string;
  name: string;
  avatar: string;
  status: 'online' | 'away' | 'offline';
  phone?: string;
  username?: string;
  bio?: string;
  birthday?: string;
  isFavorite?: boolean;
}

export interface CallRecord {
  id: string;
  contactId: string;
  contactName: string;
  type: 'audio' | 'video' | 'missed_audio' | 'missed_video';
  duration: string;
  timestamp: string;
  isIncoming: boolean;
}

export interface MarketplaceItem {
  id: string;
  title: string;
  description: string;
  price: number;
  maxPrice: number;
  sellerId: string;
  sellerName: string;
  images?: string[];
  category: string;
  condition?: 'new' | 'used';
  status: 'available' | 'sold' | 'pending';
  createdAt: string;
}

export interface CartItem {
  item: MarketplaceItem;
  quantity: number;
}

export type OnboardingStep = 'welcome' | 'registration' | 'verification' | 'pin' | 'permissions';
export type TabView = 'chats' | 'feed' | 'ai' | 'profile';

export interface ModerationResult {
  isSafe: boolean;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  categories: string[];
  warning: string | null;
  suggestedAction: string | null;
  timestamp: string;
}

export type AppView =
  | 'onboarding'
  | 'chats'
  | 'archive'
  | 'chat'
  | 'feed'
  | 'ai-center'
  | 'profile'
  | 'group-creation'
  | 'chat-settings'
  | 'global-search'
  | 'contact-profile'
  | 'new-contact'
  | 'edit-profile'
  | 'create-channel'
  | 'notifications'
  | 'storage'
  | 'favorites'
  | 'contacts'
  | 'calls'
  | 'two-factor'
  | 'personal-data'
  | 'settings'
  | 'create-post'
  | 'marketplace'
  | 'library'
  | 'library-reader'
  | 'call-screen';
