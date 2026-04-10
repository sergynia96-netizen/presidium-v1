export interface Bot {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  prompt: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBotInput {
  name: string;
  description?: string;
  prompt: string;
  avatarUrl?: string;
}

export interface UpdateBotInput {
  name?: string;
  description?: string | null;
  prompt?: string;
  avatarUrl?: string | null;
}

export interface BotMessageResult {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  type: string;
  status: string;
  isMe: boolean;
  createdAt: string;
  updatedAt: string;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || 'Request failed');
  }

  return payload;
}

export async function listBots(): Promise<Bot[]> {
  const data = await apiFetch<{ success: boolean; bots: Bot[] }>('/api/bots');
  return data.bots || [];
}

export async function createBot(input: CreateBotInput): Promise<Bot> {
  const data = await apiFetch<{ success: boolean; bot: Bot }>('/api/bots', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.bot;
}

export async function getBot(botId: string): Promise<Bot> {
  const data = await apiFetch<{ success: boolean; bot: Bot }>(`/api/bots/${encodeURIComponent(botId)}`);
  return data.bot;
}

export async function updateBot(botId: string, input: UpdateBotInput): Promise<Bot> {
  const data = await apiFetch<{ success: boolean; bot: Bot }>(`/api/bots/${encodeURIComponent(botId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return data.bot;
}

export async function deleteBot(botId: string): Promise<void> {
  await apiFetch<{ success: boolean }>(`/api/bots/${encodeURIComponent(botId)}`, {
    method: 'DELETE',
  });
}

export async function sendBotMessage(
  botId: string,
  input: { chatId: string; message: string },
): Promise<BotMessageResult> {
  const data = await apiFetch<{ success: boolean; message: BotMessageResult }>(
    `/api/bots/${encodeURIComponent(botId)}/message`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  return data.message;
}
