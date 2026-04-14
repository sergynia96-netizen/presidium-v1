/**
 * API Client for PRESIDIUM Messenger
 * Handles all HTTP requests to the backend
 */

const API_BASE = '/api';

interface ApiError {
  error: string;
  details?: unknown;
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  error?: string;
}

// Helper for API requests
async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  
  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const error: ApiError = {
      error: data.error || 'Request failed',
      details: data.details,
    };
    throw new Error(error.error);
  }

  return data as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth API
// ─────────────────────────────────────────────────────────────────────────────

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  username?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  status?: string;
  username?: string;
  phone?: string;
}

export const authApi = {
  register: (data: RegisterData) =>
    fetchApi<ApiResponse<{ user: User }>>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Users API
// ─────────────────────────────────────────────────────────────────────────────

export interface UsersListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'online' | 'away' | 'offline';
}

export interface UsersListResponse {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export const usersApi = {
  list: (params?: UsersListParams) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', params.page.toString());
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.search) searchParams.set('search', params.search);
    if (params?.status) searchParams.set('status', params.status);

    const query = searchParams.toString();
    return fetchApi<UsersListResponse>(`/users${query ? `?${query}` : ''}`);
  },

  get: (id: string) =>
    fetchApi<ApiResponse<{ user: User }>>(`/users/${id}`),

  update: (id: string, data: Partial<User>) =>
    fetchApi<ApiResponse<{ user: User }>>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<ApiResponse<unknown>>(`/users/${id}`, {
      method: 'DELETE',
    }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Chats API
// ─────────────────────────────────────────────────────────────────────────────

export interface Chat {
  id: string;
  type: 'private' | 'group' | 'ai';
  name: string;
  avatar?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  isPinned?: boolean;
  isMuted?: boolean;
  isEncrypted?: boolean;
  encryptionType?: 'e2e' | 'p2p' | 'server';
  members?: User[];
  role?: string;
}

export interface ChatsListResponse {
  chats: Chat[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export const chatsApi = {
  list: (page = 1, limit = 50) =>
    fetchApi<ChatsListResponse>(`/chats?page=${page}&limit=${limit}`),

  create: (data: {
    name: string;
    type: 'private' | 'group';
    avatar?: string;
    memberIds?: string[];
    isEncrypted?: boolean;
    encryptionType?: 'e2e' | 'p2p' | 'server';
  }) =>
    fetchApi<ApiResponse<{ chat: Chat }>>('/chats', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Messages API
// ─────────────────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  senderName?: string;
  senderAvatar?: string;
  sender?: User;
  anonymousAdmin?: boolean;
  content: string;
  type:
    | 'text'
    | 'system'
    | 'ai'
    | 'openclaw'
    | 'voice'
    | 'video-circle'
    | 'media'
    | 'image'
    | 'video'
    | 'file';
  mediaUrl?: string | null;
  mediaType?: 'image' | 'file' | 'audio';
  mediaName?: string;
  mediaSize?: number;
  mediaMimeType?: string;
  status: 'sending' | 'sent' | 'delivered' | 'read';
  isPinned?: boolean;
  isEdited?: boolean;
  replyTo?: {
    id: string;
    senderName: string;
    content: string;
    type:
      | 'text'
      | 'system'
      | 'ai'
      | 'openclaw'
      | 'voice'
      | 'video-circle'
      | 'media'
      | 'image'
      | 'video'
      | 'file';
  };
  forwardedFrom?: {
    id: string;
    senderName: string;
    content: string;
    type:
      | 'text'
      | 'system'
      | 'ai'
      | 'openclaw'
      | 'voice'
      | 'video-circle'
      | 'media'
      | 'image'
      | 'video'
      | 'file';
    fromChatName?: string;
  };
  createdAt: string;
  updatedAt?: string;
}

export interface MessagesListResponse {
  messages: Message[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export const messagesApi = {
  list: (chatId: string, page = 1, limit = 50) =>
    fetchApi<MessagesListResponse>(
      `/messages?chatId=${chatId}&page=${page}&limit=${limit}`
    ),

  send: (data: {
    id?: string;
    chatId: string;
    content: string;
    type?:
      | 'text'
      | 'system'
      | 'ai'
      | 'openclaw'
      | 'voice'
      | 'video-circle'
      | 'media'
      | 'image'
      | 'video'
      | 'file';
    mediaUrl?: string;
    mediaType?: 'image' | 'file' | 'audio';
    mediaName?: string;
    mediaSize?: number;
    mediaMimeType?: string;
    replyTo?: {
      id: string;
      senderName: string;
      content: string;
      type:
        | 'text'
        | 'system'
        | 'ai'
        | 'openclaw'
        | 'voice'
        | 'video-circle'
        | 'media'
        | 'image'
        | 'video'
        | 'file';
    };
    forwardedFrom?: {
      id: string;
      senderName: string;
      content: string;
      type:
        | 'text'
        | 'system'
        | 'ai'
        | 'openclaw'
        | 'voice'
        | 'video-circle'
        | 'media'
        | 'image'
        | 'video'
        | 'file';
      fromChatName?: string;
    };
    anonymousAdmin?: boolean;
  }) =>
    fetchApi<ApiResponse<{ message: Message }>>('/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (
    id: string,
    data: {
      content?: string;
      status?: 'sending' | 'sent' | 'delivered' | 'read';
      isPinned?: boolean;
    },
  ) =>
    fetchApi<ApiResponse<{ message: Message }>>(`/messages/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<ApiResponse<unknown>>(`/messages/${id}`, {
      method: 'DELETE',
    }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Contacts API
// ─────────────────────────────────────────────────────────────────────────────

export interface Contact {
  id: string;
  contactId: string;
  customName?: string | null;
  isFavorite: boolean;
  isBlocked: boolean;
  contact: User & { displayName: string };
  createdAt: string;
  updatedAt?: string;
}

export const contactsApi = {
  list: (favoritesOnly = false, search?: string) => {
    const params = new URLSearchParams();
    if (favoritesOnly) params.set('favorites', 'true');
    if (search) params.set('search', search);
    return fetchApi<ApiResponse<{ contacts: Contact[] }>>(
      `/contacts${params.toString() ? `?${params.toString()}` : ''}`
    );
  },

  add: (data: {
    contactId?: string;
    username?: string;
    email?: string;
    phone?: string;
    query?: string;
    name?: string;
    isFavorite?: boolean;
  }) =>
    fetchApi<ApiResponse<{ contact: Contact }>>('/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (
    id: string,
    data: { name?: string; isFavorite?: boolean; isBlocked?: boolean }
  ) =>
    fetchApi<ApiResponse<{ contact: Contact }>>(`/contacts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    fetchApi<ApiResponse<unknown>>(`/contacts/${id}`, {
      method: 'DELETE',
    }),
};

// ─────────────────────────────────────────────────────────────────────────────
// AI Chat API
// ─────────────────────────────────────────────────────────────────────────────

export interface AIChatRequest {
  message: string;
  conversationId: string;
  mode?:
    | 'default'
    | 'summarize'
    | 'reply'
    | 'meeting'
    | 'translation'
    | 'writing'
    | 'tasks'
    | 'code'
    | 'insights'
    | 'briefing';
}

export interface AIChatResponse {
  success: boolean;
  response: string;
  messageCount: number;
}

export interface AIConversationDto {
  id: string;
  title: string;
  mode: string;
  lastMessage: string;
  updatedAt: string;
  messages: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
}

export interface AIConversationsResponse {
  success: boolean;
  conversations: AIConversationDto[];
}

export const aiChatApi = {
  list: (params?: { conversationId?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.conversationId) query.set('conversationId', params.conversationId);
    if (params?.limit) query.set('limit', String(params.limit));
    const suffix = query.toString();
    return fetchApi<AIConversationsResponse>(`/ai-chat${suffix ? `?${suffix}` : ''}`);
  },

  send: (data: AIChatRequest) =>
    fetchApi<AIChatResponse | ApiError>('/ai-chat', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  delete: (conversationId: string) =>
    fetchApi<ApiResponse<unknown>>('/ai-chat', {
      method: 'DELETE',
      body: JSON.stringify({ conversationId }),
    }),
};

// ─────────────────────────────────────────────────────────────────────────────
// OpenClaw Moderation API
// ─────────────────────────────────────────────────────────────────────────────

export interface ModerationResult {
  isSafe: boolean;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  categories: string[];
  warning: string | null;
  suggestedAction: string | null;
}

export const openClawApi = {
  moderate: (message: string, context?: string) =>
    fetchApi<ModerationResult>('/openclaw/moderate', {
      method: 'POST',
      body: JSON.stringify({ message, context }),
    }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Feed API
// ─────────────────────────────────────────────────────────────────────────────

export interface FeedCommentDto {
  id: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  timestamp: string;
  likes: number;
}

export interface FeedPostDto {
  id: string;
  channelName: string;
  channelAvatar?: string;
  title: string;
  content: string;
  timestamp: string;
  likes: number;
  dislikes: number;
  comments: number;
  commentList?: FeedCommentDto[];
  isLiked?: boolean;
  isDisliked?: boolean;
  isReposted?: boolean;
  authorId?: string;
  repostCount?: number;
}

export interface FeedPostsResponse {
  posts: FeedPostDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export const feedApi = {
  list: (params?: { page?: number; limit?: number; q?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.q) searchParams.set('q', params.q);
    const query = searchParams.toString();
    return fetchApi<FeedPostsResponse>(`/feed/posts${query ? `?${query}` : ''}`);
  },

  create: (payload: { title?: string; content: string }) =>
    fetchApi<{ success: boolean; post: FeedPostDto }>('/feed/posts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  react: (postId: string, action: 'like' | 'dislike' | 'repost') =>
    fetchApi<{ success: boolean; post: FeedPostDto }>(`/feed/posts/${postId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

  listComments: (postId: string) =>
    fetchApi<{ comments: FeedCommentDto[]; total: number }>(`/feed/posts/${postId}/comments`),

  createComment: (postId: string, content: string) =>
    fetchApi<{ success: boolean; comment: FeedCommentDto; commentsCount: number }>(`/feed/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
};
