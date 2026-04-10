/**
 * Data export/account actions aligned with current API contracts.
 *
 * Endpoints used:
 * - GET /api/users/:id
 * - GET /api/users/:id/preferences
 * - GET /api/contacts
 * - GET /api/chats
 * - GET /api/messages?chatId=...
 * - GET /api/ai-chat
 * - GET/DELETE /api/sessions
 * - DELETE /api/users/:id
 * - GET /api/auth/session (current session snapshot)
 */

type ApiErrorPayload = { error?: string; message?: string };

interface ApiPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

interface UserResponse {
  user?: Record<string, unknown>;
}

interface PreferencesResponse {
  settings?: Record<string, unknown>;
}

interface ContactsResponse {
  contacts?: Array<Record<string, unknown>>;
}

interface ChatsResponse {
  chats?: Array<Record<string, unknown>>;
  pagination?: ApiPagination;
}

interface MessagesResponse {
  messages?: Array<Record<string, unknown>>;
  pagination?: ApiPagination;
}

interface AiConversationsResponse {
  conversations?: Array<Record<string, unknown>>;
}

interface SessionsResponse {
  sessions?: Array<{
    id: string;
    current: boolean;
    userAgent?: string | null;
    ipAddress?: string | null;
    lastActiveAt?: string | null;
    expiresAt?: string | null;
    deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown';
    deviceName?: string;
    source?: 'jwt' | 'database';
  }>;
}

interface DeviceLinkResponse {
  success?: boolean;
  link?: {
    ownerUserId: string;
    code: string;
    expiresAt: string;
    pairingUri: string;
  };
}

interface ExportChatRecord extends Record<string, unknown> {
  id: string;
  messages: Array<Record<string, unknown>>;
}

export interface DataExportPayload {
  version: 2;
  exportedAt: string;
  source: 'api';
  user: Record<string, unknown> | null;
  preferences: Record<string, unknown> | null;
  contacts: Array<Record<string, unknown>>;
  chats: ExportChatRecord[];
  aiConversations: Array<Record<string, unknown>>;
  warnings: string[];
}

export interface ExportOptions {
  chatsPageSize?: number;
  messagesPageSize?: number;
  maxChats?: number;
  maxMessagesPerChat?: number;
  includeAiConversations?: boolean;
}

export type ExportFormat = 'json' | 'html';

export interface SessionSnapshot {
  id: string;
  current: boolean;
  user: {
    id?: string;
    email?: string;
    name?: string;
    image?: string;
  };
  expires: string | null;
  userAgent: string | null;
  ipAddress?: string | null;
  lastActiveAt?: string | null;
  deviceType?: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  deviceName?: string;
  source?: 'jwt' | 'database';
}

const DEFAULT_EXPORT_OPTIONS: Required<ExportOptions> = {
  chatsPageSize: 100,
  messagesPageSize: 200,
  maxChats: 1000,
  maxMessagesPerChat: 5000,
  includeAiConversations: true,
};

async function parseJsonSafe<T>(response: Response): Promise<T | null> {
  try {
    const data = (await response.json()) as T;
    return data;
  } catch {
    return null;
  }
}

async function fetchApi<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const response = await fetch(endpoint, {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const payload = await parseJsonSafe<T & ApiErrorPayload>(response);

  if (!response.ok) {
    const reason =
      payload?.error ||
      payload?.message ||
      `Request failed (${response.status})`;
    throw new Error(reason);
  }

  if (!payload) {
    throw new Error(`Empty response from ${endpoint}`);
  }

  return payload;
}

async function fetchAllChats(pageSize: number, maxChats: number): Promise<Array<Record<string, unknown>>> {
  const chats: Array<Record<string, unknown>> = [];
  let page = 1;

  while (chats.length < maxChats) {
    const data = await fetchApi<ChatsResponse>(`/api/chats?page=${page}&limit=${pageSize}`);
    const batch = Array.isArray(data.chats) ? data.chats : [];
    chats.push(...batch);

    const hasMore = Boolean(data.pagination?.hasMore);
    if (!hasMore || batch.length === 0) {
      break;
    }
    page += 1;
  }

  return chats.slice(0, maxChats);
}

async function fetchAllMessagesForChat(
  chatId: string,
  pageSize: number,
  maxMessages: number,
): Promise<Array<Record<string, unknown>>> {
  const messages: Array<Record<string, unknown>> = [];
  let page = 1;

  while (messages.length < maxMessages) {
    const data = await fetchApi<MessagesResponse>(
      `/api/messages?chatId=${encodeURIComponent(chatId)}&page=${page}&limit=${pageSize}`,
    );
    const batch = Array.isArray(data.messages) ? data.messages : [];
    messages.push(...batch);

    const hasMore = Boolean(data.pagination?.hasMore);
    if (!hasMore || batch.length === 0) {
      break;
    }
    page += 1;
  }

  return messages.slice(0, maxMessages);
}

function buildHtmlExport(payload: DataExportPayload): string {
  const safe = (value: unknown) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');

  const chatRows = payload.chats
    .map((chat) => {
      const title = safe(chat.name || chat.id);
      const count = chat.messages.length;
      return `<li><strong>${title}</strong> — ${count} messages</li>`;
    })
    .join('');

  const warningRows = payload.warnings.map((w) => `<li>${safe(w)}</li>`).join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Presidium Export</title>
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; margin: 24px; line-height: 1.45; }
      h1, h2 { margin: 0 0 12px; }
      section { margin: 0 0 20px; padding: 12px; border: 1px solid #ddd; border-radius: 8px; }
      code { background: #f6f6f6; padding: 2px 6px; border-radius: 4px; }
      ul { margin: 8px 0 0; }
    </style>
  </head>
  <body>
    <h1>Presidium Data Export</h1>
    <p>Generated: <code>${safe(payload.exportedAt)}</code></p>
    <section>
      <h2>Summary</h2>
      <ul>
        <li>Contacts: ${payload.contacts.length}</li>
        <li>Chats: ${payload.chats.length}</li>
        <li>AI conversations: ${payload.aiConversations.length}</li>
      </ul>
    </section>
    <section>
      <h2>Chats</h2>
      <ul>${chatRows || '<li>No chats exported</li>'}</ul>
    </section>
    <section>
      <h2>Warnings</h2>
      <ul>${warningRows || '<li>No warnings</li>'}</ul>
    </section>
  </body>
</html>`;
}

function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') {
    throw new Error('Download is only available in the browser');
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function buildDataExportPayload(
  userId: string,
  options: ExportOptions = {},
): Promise<DataExportPayload> {
  const cfg = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  const warnings: string[] = [];

  const [userData, preferencesData, contactsData, chatsData] = await Promise.all([
    fetchApi<UserResponse>(`/api/users/${encodeURIComponent(userId)}`).catch((error: unknown) => {
      warnings.push(error instanceof Error ? `user: ${error.message}` : 'user: failed');
      return { user: null };
    }),
    fetchApi<PreferencesResponse>(`/api/users/${encodeURIComponent(userId)}/preferences`).catch(
      (error: unknown) => {
        warnings.push(error instanceof Error ? `preferences: ${error.message}` : 'preferences: failed');
        return { settings: null };
      },
    ),
    fetchApi<ContactsResponse>('/api/contacts').catch((error: unknown) => {
      warnings.push(error instanceof Error ? `contacts: ${error.message}` : 'contacts: failed');
      return { contacts: [] };
    }),
    fetchAllChats(cfg.chatsPageSize, cfg.maxChats).catch((error: unknown) => {
      warnings.push(error instanceof Error ? `chats: ${error.message}` : 'chats: failed');
      return [] as Array<Record<string, unknown>>;
    }),
  ]);

  const chatsWithMessages: ExportChatRecord[] = [];
  for (const chat of chatsData) {
    const chatId = typeof chat.id === 'string' ? chat.id : '';
    if (!chatId) {
      continue;
    }
    try {
      const messages = await fetchAllMessagesForChat(chatId, cfg.messagesPageSize, cfg.maxMessagesPerChat);
      chatsWithMessages.push({
        ...chat,
        id: chatId,
        messages,
      });
    } catch (error) {
      warnings.push(error instanceof Error ? `messages(${chatId}): ${error.message}` : `messages(${chatId}): failed`);
      chatsWithMessages.push({
        ...chat,
        id: chatId,
        messages: [],
      });
    }
  }

  let aiConversations: Array<Record<string, unknown>> = [];
  if (cfg.includeAiConversations) {
    try {
      const aiData = await fetchApi<AiConversationsResponse>(`/api/ai-chat?limit=200`);
      aiConversations = Array.isArray(aiData.conversations) ? aiData.conversations : [];
    } catch (error) {
      warnings.push(error instanceof Error ? `ai-chat: ${error.message}` : 'ai-chat: failed');
    }
  }

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    source: 'api',
    user: userData.user ?? null,
    preferences: preferencesData.settings ?? null,
    contacts: Array.isArray(contactsData.contacts) ? contactsData.contacts : [],
    chats: chatsWithMessages,
    aiConversations,
    warnings,
  };
}

export async function exportAllDataToFile(
  userId: string,
  format: ExportFormat = 'json',
  options: ExportOptions = {},
): Promise<DataExportPayload> {
  const payload = await buildDataExportPayload(userId, options);
  const timestamp = Date.now();
  const base = `presidium-export-${timestamp}`;

  if (format === 'html') {
    const html = buildHtmlExport(payload);
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${base}.html`);
    return payload;
  }

  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
    `${base}.json`,
  );
  return payload;
}

export async function exportSingleChatToFile(
  chatId: string,
  format: ExportFormat = 'json',
  options: Pick<ExportOptions, 'messagesPageSize' | 'maxMessagesPerChat'> = {},
): Promise<{ chatId: string; exportedAt: string; messages: Array<Record<string, unknown>> }> {
  const cfg = {
    messagesPageSize: options.messagesPageSize || DEFAULT_EXPORT_OPTIONS.messagesPageSize,
    maxMessagesPerChat: options.maxMessagesPerChat || DEFAULT_EXPORT_OPTIONS.maxMessagesPerChat,
  };

  const messages = await fetchAllMessagesForChat(chatId, cfg.messagesPageSize, cfg.maxMessagesPerChat);
  const payload = {
    chatId,
    exportedAt: new Date().toISOString(),
    messages,
  };

  const timestamp = Date.now();
  const base = `presidium-chat-${chatId}-${timestamp}`;

  if (format === 'html') {
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Chat Export</title></head>
<body><h1>Chat ${chatId}</h1><pre>${JSON.stringify(payload, null, 2)}</pre></body></html>`;
    downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${base}.html`);
    return payload;
  }

  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
    `${base}.json`,
  );
  return payload;
}

export async function deleteOwnAccount(userId: string): Promise<void> {
  await fetchApi<{ success?: boolean }>(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  });
}

export async function listActiveSessions(): Promise<SessionSnapshot[]> {
  const data = await fetchApi<SessionsResponse>('/api/sessions');
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];

  return sessions.map((session) => ({
    id: session.id,
    current: Boolean(session.current),
    user: {},
    expires: session.expiresAt || null,
    userAgent: session.userAgent || null,
    ipAddress: session.ipAddress || null,
    lastActiveAt: session.lastActiveAt || null,
    deviceType: session.deviceType || 'unknown',
    deviceName: session.deviceName || 'Unknown device',
    source: session.source,
  }));
}

export async function revokeActiveSession(sessionId: string): Promise<void> {
  await fetchApi<{ success?: boolean }>('/api/sessions', {
    method: 'DELETE',
    body: JSON.stringify({ sessionId }),
  });
}

export async function revokeAllOtherSessions(): Promise<void> {
  await fetchApi<{ success?: boolean }>('/api/sessions', {
    method: 'DELETE',
    body: JSON.stringify({ revokeAllOthers: true }),
  });
}

export async function issueDeviceLink(): Promise<{
  ownerUserId: string;
  code: string;
  expiresAt: string;
  pairingUri: string;
}> {
  const data = await fetchApi<DeviceLinkResponse>('/api/devices/link', {
    method: 'POST',
  });

  if (!data.link) {
    throw new Error('Failed to issue device-link code');
  }

  return data.link;
}

export async function revokeDeviceLink(): Promise<void> {
  await fetchApi<{ success?: boolean }>('/api/devices/link', {
    method: 'DELETE',
  });
}

export async function getCurrentSessionSnapshot(): Promise<SessionSnapshot | null> {
  const activeSessions = await listActiveSessions().catch(() => []);
  const currentSession = activeSessions.find((session) => session.current);
  if (currentSession) {
    return currentSession;
  }

  const sessionData = await fetchApi<{ user?: SessionSnapshot['user']; expires?: string | null }>('/api/auth/session').catch(
    () => null,
  );

  if (!sessionData?.user) {
    return null;
  }

  return {
    id: 'current',
    current: true,
    user: sessionData.user,
    expires: sessionData.expires || null,
    userAgent:
      typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string'
        ? navigator.userAgent
        : null,
    ipAddress: null,
    lastActiveAt: new Date().toISOString(),
    deviceType: undefined,
    deviceName: undefined,
    source: 'jwt',
  };
}
