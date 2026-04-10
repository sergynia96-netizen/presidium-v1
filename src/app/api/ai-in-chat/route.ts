import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { rateLimit } from '@/lib/rate-limit';
import { callGLM4, GLM4RateLimitError, type GLM4Message } from '@/lib/glm4';
import { z } from 'zod';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  senderName?: string;
  content: string;
}

const inChatHistoryMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  senderName: z.string().max(120).optional(),
  content: z.string().min(1).max(4000),
});

const inChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  chatId: z.string().min(1).max(100),
  chatHistory: z.array(inChatHistoryMessageSchema).max(100).optional(),
  requestId: z.string().min(1).max(128).optional(),
  responseMessageId: z.string().min(1).max(128).optional(),
  mode: z
    .enum(['assistant', 'summarize', 'translate', 'reply', 'explain', 'moderate_advice'])
    .optional(),
});

const inChatDeleteSchema = z.object({
  chatId: z.string().min(1).max(100).optional(),
});

// In-memory conversation store keyed by userId + chatId
const chatHistories = new Map<string, ChatMessage[]>();
const processedAiRequests = new Map<
  string,
  { response: string; mode: string; responseMessageId: string | null; createdAt: number }
>();

const SYSTEM_PROMPTS: Record<string, string> = {
  assistant: `You are Presidium AI, an in-chat assistant in the PRESIDIUM messenger app. You help users directly within their conversations. You can reference previous messages and participants in the chat. Be concise, helpful, and friendly. Respond in the same language the user writes in. Keep responses short since you are embedded in a chat interface.`,

  summarize: `You are Presidium AI's Summarize feature in a chat. You summarize recent messages in the conversation into a concise overview. Highlight key points, decisions, and action items. Use bullet points when appropriate. Keep the summary brief and readable. Respond in the same language the messages are written in.`,

  translate: `You are Presidium AI's Translation feature in a chat. You translate text between languages accurately while preserving tone, meaning, and formatting. Detect the source language automatically. If the user doesn't specify a target language, translate to English. Provide only the translation without explanations unless asked.`,

  reply: `You are Presidium AI's Smart Reply feature in a chat. You suggest contextually appropriate replies based on the conversation. Consider the tone, context, and participants. Provide 2-3 short reply options that the user can choose from. Format each option on a new line. Keep suggestions natural and conversational.`,

  explain: `You are Presidium AI's Explain feature in a chat. You explain concepts, terms, code, or content that users ask about in clear and simple language. You can reference the conversation context. Be educational but concise. Use examples when helpful. Respond in the same language the user writes in.`,

  moderate_advice: `You are Presidium AI's Content Safety Advisor in a chat. You provide advice about content safety, digital wellbeing, and healthy communication. You help users understand why certain content might be flagged, suggest ways to communicate respectfully, and offer alternatives. Be non-judgmental, educational, and supportive. Note that PRESIDIUM is a P2P messenger where AI moderation is the only safety mechanism since the server cannot read messages.`,
};

const DEFAULT_MODE = 'assistant';
const REQUEST_CACHE_TTL_MS = 30 * 60 * 1000;

function getChatHistoryKey(userId: string, chatId: string): string {
  return `${userId}::${chatId}`;
}

function getOrCreateHistory(userId: string, chatId: string, mode: string = DEFAULT_MODE): ChatMessage[] {
  const historyKey = getChatHistoryKey(userId, chatId);
  if (!chatHistories.has(historyKey)) {
    const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS[DEFAULT_MODE];
    chatHistories.set(historyKey, [{ role: 'system', content: systemPrompt }]);
  }
  const history = chatHistories.get(historyKey);
  if (!history) {
    throw new Error('Failed to initialize chat history');
  }
  return history;
}

function pruneProcessedRequestCache(now: number) {
  for (const [key, value] of processedAiRequests.entries()) {
    if (now - value.createdAt > REQUEST_CACHE_TTL_MS) {
      processedAiRequests.delete(key);
    }
  }
}

function resolveRequesterUserId(request: NextRequest, sessionUserId?: string): string | null {
  if (sessionUserId) return sessionUserId;

  const isDevOrLan = process.env.NODE_ENV !== 'production';
  const allowAnonymousAI = isDevOrLan || process.env.ALLOW_ANON_AI === 'true';
  if (!allowAnonymousAI) return null;

  const requestIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local';
  const requestUa = request.headers.get('user-agent') || 'unknown';

  return `anon:${Buffer.from(`${requestIp}:${requestUa.slice(0, 64)}`).toString('base64url').slice(0, 24)}`;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = resolveRequesterUserId(request, session?.user?.id);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`ai-in-chat:post:${userId}`, {
      maxRequests: 30,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many AI requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const body = await request.json();
    const parse = inChatRequestSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parse.error.flatten() },
        { status: 400 },
      );
    }

    const { message, chatId, chatHistory, mode, requestId, responseMessageId } = parse.data;
    const now = Date.now();
    pruneProcessedRequestCache(now);

    const dedupeKey = requestId ? `${userId}:${chatId}:${requestId}` : null;
    if (dedupeKey) {
      const existing = processedAiRequests.get(dedupeKey);
      if (existing) {
        return NextResponse.json({
          success: true,
          response: existing.response,
          mode: existing.mode,
          responseMessageId: existing.responseMessageId ?? responseMessageId ?? null,
        });
      }
    }

    const resolvedMode = mode && SYSTEM_PROMPTS[mode] ? mode : DEFAULT_MODE;
    const history = getOrCreateHistory(userId, chatId, resolvedMode);

    // Override system prompt if mode changed and history is still empty except system.
    if (resolvedMode !== DEFAULT_MODE && history.length === 1) {
      const systemPrompt = SYSTEM_PROMPTS[resolvedMode] || SYSTEM_PROMPTS[DEFAULT_MODE];
      history[0] = { role: 'system', content: systemPrompt };
    }

    let contextMessage = message;
    if (chatHistory && chatHistory.length > 0) {
      const recentHistory = chatHistory.slice(-20);
      const historyContext = recentHistory
        .map((msg) => {
          const sender = msg.senderName || msg.role;
          return `${sender}: ${msg.content}`;
        })
        .join('\n');

      contextMessage = `Here is the recent chat context:\n${historyContext}\n\nUser request: ${message}`;
    }

    history.push({ role: 'user', content: contextMessage });

    // Keep system + last 20 dialog messages
    if (history.length > 21) {
      const system = history[0];
      const trimmed = [system, ...history.slice(-20)];
      chatHistories.set(getChatHistoryKey(userId, chatId), trimmed);
    }

    const glmMessages: GLM4Message[] = history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
    const aiResponse = await callGLM4(glmMessages);

    history.push({ role: 'assistant', content: aiResponse });

    if (dedupeKey) {
      processedAiRequests.set(dedupeKey, {
        response: aiResponse,
        mode: resolvedMode,
        responseMessageId: responseMessageId || null,
        createdAt: now,
      });
    }

    return NextResponse.json({
      success: true,
      response: aiResponse,
      mode: resolvedMode,
      responseMessageId: responseMessageId || null,
    });
  } catch (error: unknown) {
    if (error instanceof GLM4RateLimitError) {
      return NextResponse.json(
        {
          error: 'GLM-4 rate limit exceeded',
          retryAfterMs: error.retryAfterMs,
        },
        { status: 429 },
      );
    }

    if (
      error instanceof Error &&
      /GLM4_API_KEY|missing or placeholder/i.test(error.message)
    ) {
      return NextResponse.json(
        {
          error:
            'AI provider is not configured. Set GLM4_API_KEY in .env.local and restart the app.',
        },
        { status: 503 },
      );
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = resolveRequesterUserId(request, session?.user?.id);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`ai-in-chat:delete:${userId}`, {
      maxRequests: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many delete requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const body = await request.json();
    const parse = inChatDeleteSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parse.error.flatten() },
        { status: 400 },
      );
    }

    const { chatId } = parse.data;
    if (chatId) {
      chatHistories.delete(getChatHistoryKey(userId, chatId));
      const dedupePrefix = `${userId}:${chatId}:`;
      for (const key of processedAiRequests.keys()) {
        if (key.startsWith(dedupePrefix)) {
          processedAiRequests.delete(key);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete chat history' }, { status: 500 });
  }
}
