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

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  senderName: z.string().max(120).optional(),
  content: z.string().min(1).max(4000),
});

const openClawChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  chatId: z.string().min(1).max(100),
  chatHistory: z.array(chatMessageSchema).max(100).optional(),
  requestId: z.string().min(1).max(128).optional(),
  responseMessageId: z.string().min(1).max(128).optional(),
  mode: z.enum(['default', 'scan', 'safety', 'insight', 'interest']).optional(),
});

const openClawChatDeleteSchema = z.object({
  chatId: z.string().min(1).max(100).optional(),
});

const histories = new Map<string, ChatMessage[]>();
const processedOpenClawRequests = new Map<
  string,
  { response: string; mode: string; responseMessageId: string | null; createdAt: number }
>();
const REQUEST_CACHE_TTL_MS = 30 * 60 * 1000;

const DEFAULT_PROMPT = `You are OpenClaw, an in-chat moderator and administrator assistant for PRESIDIUM.

Main role:
- Help users keep chats safe.
- Detect risks related to extremism, terrorism, fascism, drug business, violence, pornography, and fraud.
- Provide short, practical guidance in the user's language.
- If dangerous intent is detected, state clearly that it violates policy and suggest safe alternatives.

Style:
- concise
- neutral
- actionable
- use short bullet points when useful`;

const MODE_PROMPTS: Record<string, string> = {
  default: DEFAULT_PROMPT,
  scan: `${DEFAULT_PROMPT}\n\nMode: scan the provided conversation and return a concise safety summary.`,
  safety: `${DEFAULT_PROMPT}\n\nMode: produce a safety score (1-10) and key risks.`,
  insight: `${DEFAULT_PROMPT}\n\nMode: provide brief conversation insights and main topics.`,
  interest: `${DEFAULT_PROMPT}\n\nMode: infer user interests and suggest feed/marketplace directions.`,
};

function getHistoryKey(userId: string, chatId: string): string {
  return `openclaw:${userId}:${chatId}`;
}

function getHistory(userId: string, chatId: string, systemPrompt: string) {
  const key = getHistoryKey(userId, chatId);
  const existing = histories.get(key);
  if (existing) {
    return existing;
  }
  const seeded: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
  histories.set(key, seeded);
  return seeded;
}

function pruneProcessedRequestCache(now: number) {
  for (const [key, value] of processedOpenClawRequests.entries()) {
    if (now - value.createdAt > REQUEST_CACHE_TTL_MS) {
      processedOpenClawRequests.delete(key);
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

    const limit = rateLimit(`openclaw-chat:post:${userId}`, {
      maxRequests: 24,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many OpenClaw chat requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const body = await request.json();
    const parse = openClawChatRequestSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parse.error.flatten() },
        { status: 400 },
      );
    }

    const { message, chatId, chatHistory, mode: requestedMode, requestId, responseMessageId } = parse.data;
    const now = Date.now();
    pruneProcessedRequestCache(now);

    const dedupeKey = requestId ? `${userId}:${chatId}:${requestId}` : null;
    if (dedupeKey) {
      const existing = processedOpenClawRequests.get(dedupeKey);
      if (existing) {
        return NextResponse.json({
          success: true,
          response: existing.response,
          mode: existing.mode,
          responseMessageId: existing.responseMessageId ?? responseMessageId ?? null,
        });
      }
    }

    const mode = requestedMode && MODE_PROMPTS[requestedMode] ? requestedMode : 'default';
    const systemPrompt = MODE_PROMPTS[mode] ?? DEFAULT_PROMPT;
    const history = getHistory(userId, chatId, systemPrompt);

    let userMessage = message.trim();
    if (Array.isArray(chatHistory) && chatHistory.length > 0) {
      const ctx = chatHistory
        .slice(-24)
        .map((m) => `${m.senderName || m.role}: ${m.content}`)
        .join('\n');
      userMessage = `Context:\n${ctx}\n\nUser request:\n${userMessage}`;
    }

    history.push({ role: 'user', content: userMessage });
    if (history.length > 25) {
      const system = history[0];
      const trimmed = [system, ...history.slice(-24)];
      histories.set(getHistoryKey(userId, chatId), trimmed);
    }

    const glmMessages: GLM4Message[] = history.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
    const responseText = await callGLM4(glmMessages);

    history.push({ role: 'assistant', content: responseText });

    if (dedupeKey) {
      processedOpenClawRequests.set(dedupeKey, {
        response: responseText,
        mode,
        responseMessageId: responseMessageId || null,
        createdAt: now,
      });
    }

    return NextResponse.json({
      success: true,
      response: responseText,
      mode,
      responseMessageId: responseMessageId || null,
    });
  } catch (error: unknown) {
    if (error instanceof GLM4RateLimitError) {
      return NextResponse.json(
        { error: 'GLM-4 rate limit exceeded', retryAfterMs: error.retryAfterMs },
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

    const limit = rateLimit(`openclaw-chat:delete:${userId}`, {
      maxRequests: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many reset requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const body = await request.json();
    const parse = openClawChatDeleteSchema.safeParse(body);
    if (!parse.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parse.error.flatten() },
        { status: 400 },
      );
    }

    if (parse.data.chatId) {
      histories.delete(getHistoryKey(userId, parse.data.chatId));
      const dedupePrefix = `${userId}:${parse.data.chatId}:`;
      for (const key of processedOpenClawRequests.keys()) {
        if (key.startsWith(dedupePrefix)) {
          processedOpenClawRequests.delete(key);
        }
      }
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to reset OpenClaw history' }, { status: 500 });
  }
}
