/**
 * Bot Platform Module
 *
 * Features:
 * - Bot registration and management
 * - Bot commands (/help, /start, etc.)
 * - Inline bots (@botname query)
 * - Bot webhook delivery
 * - Bot permissions
 * - Bot payment integration
 * - Bot API compatibility (Telegram-like)
 *
 * Architecture:
 * - Bots are special users with bot=true flag
 * - Bot API uses HTTPS webhooks
 * - Bot commands are parsed from messages
 * - Inline bots work via @mention in any chat
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BotProfile {
  id: string;
  username: string;
  displayName: string;
  description: string;
  avatar?: string;
  commands: BotCommand[];
  inlineMode: boolean;
  inlinePlaceholder?: string;
  webhookUrl?: string;
  webhookSecret?: string;
  permissions: BotPermissions;
  ownerUserId: string;
  createdAt: number;
  isVerified: boolean;
  userCount: number;
}

export interface BotCommand {
  command: string;
  description: string;
  handler?: string;
}

export interface BotPermissions {
  canReadMessages: boolean;
  canSendMessages: boolean;
  canSendMedia: boolean;
  canInviteUsers: boolean;
  canPinMessages: boolean;
  canChangeInfo: boolean;
  canDeleteMessages: boolean;
}

export interface BotMessage {
  messageId: string;
  chatId: string;
  from: {
    id: string;
    username: string;
    isBot: boolean;
  };
  text?: string;
  entities?: BotMessageEntity[];
  replyToMessageId?: string;
  timestamp: number;
}

export interface BotMessageEntity {
  type: 'mention' | 'hashtag' | 'command' | 'url' | 'bold' | 'italic' | 'code' | 'pre' | 'text_link';
  offset: number;
  length: number;
  url?: string;
  language?: string;
}

export interface BotUpdate {
  updateId: number;
  message?: BotMessage;
  callbackQuery?: BotCallbackQuery;
  inlineQuery?: BotInlineQuery;
  chosenInlineResult?: BotChosenInlineResult;
}

export interface BotCallbackQuery {
  id: string;
  from: { id: string; username: string };
  message?: BotMessage;
  inlineMessageId?: string;
  data: string;
}

export interface BotInlineQuery {
  id: string;
  from: { id: string; username: string };
  query: string;
  offset: string;
  chatType?: string;
}

export interface BotChosenInlineResult {
  resultId: string;
  from: { id: string; username: string };
  query: string;
  inlineMessageId?: string;
}

export interface BotInlineResult {
  type: 'article' | 'photo' | 'gif' | 'sticker' | 'video' | 'audio' | 'document' | 'location' | 'venue' | 'contact';
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  contentUrl?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  duration?: number;
}

// ─── Bot Registration ───────────────────────────────────────────────────────

/**
 * Register a new bot.
 */
export async function registerBot(data: {
  username: string;
  displayName: string;
  description: string;
  webhookUrl?: string;
  commands: BotCommand[];
  inlineMode: boolean;
}): Promise<BotProfile> {
  const response = await fetch('/api/bots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to register bot');
  }

  return response.json();
}

/**
 * Get bot profile.
 */
export async function getBotProfile(botId: string): Promise<BotProfile> {
  const response = await fetch(`/api/bots/${botId}`);
  if (!response.ok) throw new Error('Bot not found');
  return response.json();
}

/**
 * Update bot settings.
 */
export async function updateBotProfile(
  botId: string,
  updates: Partial<BotProfile>,
): Promise<BotProfile> {
  const response = await fetch(`/api/bots/${botId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error('Failed to update bot');
  }

  return response.json();
}

/**
 * Delete a bot.
 */
export async function deleteBot(botId: string): Promise<void> {
  const response = await fetch(`/api/bots/${botId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete bot');
  }
}

// ─── Bot Commands ───────────────────────────────────────────────────────────

/**
 * Parse bot commands from a message.
 * Returns array of { command, args }.
 */
export function parseBotCommands(text: string): Array<{ command: string; args: string }> {
  const commands: Array<{ command: string; args: string }> = [];
  const regex = /\/(\w+)(?:@(\w+))?\s*(.*)/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    commands.push({
      command: match[1],
      args: match[3] || '',
    });
  }

  return commands;
}

/**
 * Check if a message is a bot command.
 */
export function isBotCommand(text: string, botUsername: string): boolean {
  const regex = new RegExp(`^/(\\w+)(?:@${botUsername})?\\b`, 'i');
  return regex.test(text);
}

// ─── Inline Bots ────────────────────────────────────────────────────────────

/**
 * Send an inline query to a bot.
 */
export async function sendInlineQuery(
  botUsername: string,
  query: string,
  offset: string = '',
  chatType?: string,
): Promise<BotInlineResult[]> {
  const response = await fetch(`/api/bots/${botUsername}/inline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, offset, chatType }),
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.results || [];
}

/**
 * Send an inline result to a chat.
 */
export async function sendInlineResult(
  chatId: string,
  resultId: string,
  inlineMessageId: string,
): Promise<void> {
  const response = await fetch(`/api/bots/inline/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chatId, resultId, inlineMessageId }),
  });

  if (!response.ok) {
    throw new Error('Failed to send inline result');
  }
}

// ─── Bot Webhook Delivery ───────────────────────────────────────────────────

/**
 * Deliver an update to a bot's webhook.
 */
export async function deliverBotUpdate(
  webhookUrl: string,
  update: BotUpdate,
  secret?: string,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (secret) {
      headers['X-Bot-Signature'] = await signWebhook(JSON.stringify(update), secret);
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(update),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Sign a webhook payload.
 */
async function signWebhook(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload),
  );

  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Bot API Methods ────────────────────────────────────────────────────────

/**
 * Bot API: send a message.
 */
export async function botSendMessage(
  botToken: string,
  chatId: string,
  text: string,
  options: {
    parseMode?: 'markdown' | 'html';
    replyToMessageId?: string;
    disablePreview?: boolean;
  } = {},
): Promise<BotMessage> {
  const response = await fetch('/api/bots/sendMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${botToken}`,
    },
    body: JSON.stringify({
      chatId,
      text,
      ...options,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to send message');
  }

  return response.json();
}

/**
 * Bot API: send a photo.
 */
export async function botSendPhoto(
  botToken: string,
  chatId: string,
  photo: string | Blob,
  caption?: string,
): Promise<BotMessage> {
  const formData = new FormData();
  formData.append('chatId', chatId);

  if (typeof photo === 'string') {
    formData.append('photo', photo);
  } else {
    formData.append('photo', photo, 'photo.jpg');
  }

  if (caption) {
    formData.append('caption', caption);
  }

  const response = await fetch('/api/bots/sendPhoto', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${botToken}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error('Failed to send photo');
  }

  return response.json();
}

/**
 * Bot API: edit a message.
 */
export async function botEditMessageText(
  botToken: string,
  chatId: string,
  messageId: string,
  text: string,
): Promise<BotMessage> {
  const response = await fetch('/api/bots/editMessageText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${botToken}`,
    },
    body: JSON.stringify({ chatId, messageId, text }),
  });

  if (!response.ok) {
    throw new Error('Failed to edit message');
  }

  return response.json();
}

/**
 * Bot API: delete a message.
 */
export async function botDeleteMessage(
  botToken: string,
  chatId: string,
  messageId: string,
): Promise<void> {
  const response = await fetch('/api/bots/deleteMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${botToken}`,
    },
    body: JSON.stringify({ chatId, messageId }),
  });

  if (!response.ok) {
    throw new Error('Failed to delete message');
  }
}

// ─── Bot Discovery ──────────────────────────────────────────────────────────

/**
 * Search for bots.
 */
export async function searchBots(query: string, limit: number = 20): Promise<BotProfile[]> {
  const response = await fetch(`/api/bots/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  if (!response.ok) return [];
  const data = await response.json();
  return data.bots || [];
}

/**
 * Get trending bots.
 */
export async function getTrendingBots(category?: string, limit: number = 10): Promise<BotProfile[]> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  params.set('limit', String(limit));

  const response = await fetch(`/api/bots/trending?${params}`);
  if (!response.ok) return [];
  const data = await response.json();
  return data.bots || [];
}

/**
 * Get bot categories.
 */
export async function getBotCategories(): Promise<string[]> {
  const response = await fetch('/api/bots/categories');
  if (!response.ok) return [];
  const data = await response.json();
  return data.categories || [];
}
