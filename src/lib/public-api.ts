/**
 * Public API Module
 *
 * REST API documentation and SDK for third-party developers.
 *
 * Endpoints:
 * - /api/v1/users
 * - /api/v1/chats
 * - /api/v1/messages
 * - /api/v1/contacts
 * - /api/v1/groups
 * - /api/v1/bots
 * - /api/v1/webhooks
 *
 * Authentication: Bearer token (API key)
 * Rate limiting: 1000 requests/minute per API key
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface APIKey {
  id: string;
  name: string;
  key: string; // Only shown once on creation
  permissions: APIPermission[];
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
  isActive: boolean;
}

export type APIPermission =
  | 'read:profile'
  | 'write:profile'
  | 'read:chats'
  | 'write:chats'
  | 'read:messages'
  | 'write:messages'
  | 'read:contacts'
  | 'write:contacts'
  | 'read:groups'
  | 'write:groups'
  | 'read:media'
  | 'write:media'
  | 'read:webhooks'
  | 'write:webhooks'
  | 'admin:all';

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: APIError;
  pagination?: APIPagination;
}

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface APIPagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

// ─── API Key Management ─────────────────────────────────────────────────────

/**
 * Create a new API key.
 */
export async function createAPIKey(
  name: string,
  permissions: APIPermission[],
  expiresAt?: number,
): Promise<APIKey> {
  const response = await fetch('/api/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, permissions, expiresAt }),
  });

  if (!response.ok) {
    throw new Error('Failed to create API key');
  }

  return response.json();
}

/**
 * Get all API keys.
 */
export async function getAPIKeys(): Promise<APIKey[]> {
  const response = await fetch('/api/keys');
  if (!response.ok) return [];
  const data = await response.json();
  return data.keys || [];
}

/**
 * Revoke an API key.
 */
export async function revokeAPIKey(keyId: string): Promise<void> {
  const response = await fetch(`/api/keys/${keyId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to revoke API key');
  }
}

// ─── API Client SDK ─────────────────────────────────────────────────────────

/**
 * Presidium API Client SDK.
 * Use this to interact with the Presidium API from external applications.
 */
export class PresidiumClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
  }

  // ─── Users ─────────────────────────────────────────────────────────────

  async getMe(): Promise<APIResponse<{ id: string; name: string; username: string }>> {
    return this.request('/api/v1/users/me');
  }

  async getUser(userId: string): Promise<APIResponse<{ id: string; name: string; username: string }>> {
    return this.request(`/api/v1/users/${userId}`);
  }

  async searchUsers(query: string): Promise<APIResponse<Array<{ id: string; name: string; username: string }>>> {
    return this.request(`/api/v1/users/search?q=${encodeURIComponent(query)}`);
  }

  // ─── Chats ─────────────────────────────────────────────────────────────

  async getChats(params?: { page?: number; limit?: number }): Promise<APIResponse<any[]>> {
    const qs = new URLSearchParams(params as any).toString();
    return this.request(`/api/v1/chats?${qs}`);
  }

  async getChat(chatId: string): Promise<APIResponse<any>> {
    return this.request(`/api/v1/chats/${chatId}`);
  }

  async createChat(data: { name?: string; memberIds: string[]; type?: 'private' | 'group' }): Promise<APIResponse<any>> {
    return this.request('/api/v1/chats', 'POST', data);
  }

  // ─── Messages ──────────────────────────────────────────────────────────

  async getMessages(chatId: string, params?: { page?: number; limit?: number }): Promise<APIResponse<any[]>> {
    const qs = new URLSearchParams({ chatId, ...(params as any) }).toString();
    return this.request(`/api/v1/messages?${qs}`);
  }

  async sendMessage(chatId: string, content: string, options?: { replyTo?: string }): Promise<APIResponse<any>> {
    return this.request('/api/v1/messages', 'POST', { chatId, content, ...options });
  }

  async editMessage(messageId: string, content: string): Promise<APIResponse<any>> {
    return this.request(`/api/v1/messages/${messageId}`, 'PUT', { content });
  }

  async deleteMessage(messageId: string): Promise<APIResponse<void>> {
    return this.request(`/api/v1/messages/${messageId}`, 'DELETE');
  }

  // ─── Contacts ──────────────────────────────────────────────────────────

  async getContacts(): Promise<APIResponse<any[]>> {
    return this.request('/api/v1/contacts');
  }

  async addContact(userId: string): Promise<APIResponse<any>> {
    return this.request('/api/v1/contacts', 'POST', { userId });
  }

  async removeContact(contactId: string): Promise<APIResponse<void>> {
    return this.request(`/api/v1/contacts/${contactId}`, 'DELETE');
  }

  async blockContact(contactId: string): Promise<APIResponse<void>> {
    return this.request(`/api/v1/contacts/${contactId}/block`, 'POST');
  }

  // ─── Groups ────────────────────────────────────────────────────────────

  async getGroups(): Promise<APIResponse<any[]>> {
    return this.request('/api/v1/groups');
  }

  async createGroup(data: { name: string; memberIds: string[] }): Promise<APIResponse<any>> {
    return this.request('/api/v1/groups', 'POST', data);
  }

  async addGroupMember(groupId: string, userId: string): Promise<APIResponse<void>> {
    return this.request(`/api/v1/groups/${groupId}/members`, 'POST', { userId });
  }

  async removeGroupMember(groupId: string, userId: string): Promise<APIResponse<void>> {
    return this.request(`/api/v1/groups/${groupId}/members/${userId}`, 'DELETE');
  }

  // ─── Media ─────────────────────────────────────────────────────────────

  async uploadMedia(file: Blob, chatId: string): Promise<APIResponse<{ url: string; id: string }>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('chatId', chatId);

    const response = await fetch(`${this.baseUrl}/api/v1/media`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: formData,
    });

    return response.json();
  }

  // ─── Internal ──────────────────────────────────────────────────────────

  private async request<T>(
    path: string,
    method: string = 'GET',
    body?: unknown,
  ): Promise<APIResponse<T>> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    return response.json();
  }
}

// ─── API Documentation ───────────────────────────────────────────────────────

export const API_DOCS = {
  baseUrl: '/api/v1',
  auth: 'Bearer token via API key',
  rateLimit: '1000 requests/minute',
  endpoints: {
    users: {
      'GET /api/v1/users/me': 'Get current user profile',
      'GET /api/v1/users/:id': 'Get user by ID',
      'GET /api/v1/users/search?q=': 'Search users',
    },
    chats: {
      'GET /api/v1/chats': 'List user chats',
      'GET /api/v1/chats/:id': 'Get chat details',
      'POST /api/v1/chats': 'Create new chat',
      'DELETE /api/v1/chats/:id': 'Delete chat',
    },
    messages: {
      'GET /api/v1/messages?chatId=': 'Get chat messages',
      'POST /api/v1/messages': 'Send message',
      'PUT /api/v1/messages/:id': 'Edit message',
      'DELETE /api/v1/messages/:id': 'Delete message',
    },
    contacts: {
      'GET /api/v1/contacts': 'List contacts',
      'POST /api/v1/contacts': 'Add contact',
      'DELETE /api/v1/contacts/:id': 'Remove contact',
      'POST /api/v1/contacts/:id/block': 'Block contact',
    },
    groups: {
      'GET /api/v1/groups': 'List groups',
      'POST /api/v1/groups': 'Create group',
      'POST /api/v1/groups/:id/members': 'Add member',
      'DELETE /api/v1/groups/:id/members/:userId': 'Remove member',
    },
    media: {
      'POST /api/v1/media': 'Upload media file',
      'GET /api/v1/media/:id': 'Download media',
    },
    webhooks: {
      'GET /api/v1/webhooks': 'List webhooks',
      'POST /api/v1/webhooks': 'Create webhook',
      'PUT /api/v1/webhooks/:id': 'Update webhook',
      'DELETE /api/v1/webhooks/:id': 'Delete webhook',
    },
  },
};
