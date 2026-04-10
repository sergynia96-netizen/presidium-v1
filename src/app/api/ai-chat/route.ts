import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { callGLM4, GLM4RateLimitError, type GLM4Message } from '@/lib/glm4';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ConversationListItem {
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

// In-memory conversation store keyed by conversationId (for fast access)
const conversations = new Map<string, ChatMessage[]>();

const SYSTEM_PROMPTS: Record<string, string> = {
  default: `You are Presidium AI, a helpful and intelligent assistant built into the PRESIDIUM messenger app. You help users with conversation summaries, smart replies, meeting notes, code reviews, translations, writing assistance, task creation, and general insights. Be concise, professional, and friendly. Respond in the same language the user writes in.`,
  summarize: `You are Presidium AI's Smart Summary feature. You analyze and summarize conversations, messages, and content. Provide clear, structured summaries with key points. Use bullet points when appropriate.`,
  reply: `You are Presidium AI's Smart Reply feature. You generate contextually appropriate reply suggestions for messages. Provide 2-3 short reply options that match the tone and context.`,
  meeting: `You are Presidium AI's Meeting Notes feature. You organize, structure, and summarize meeting content. Extract action items, decisions, and key discussion points in a clear format.`,
  translation: `You are Presidium AI's Translation feature. You translate text between languages accurately while preserving tone and meaning. Detect the source language automatically.`,
  writing: `You are Presidium AI's Writing Assistant. You help improve text by fixing grammar, enhancing clarity, and suggesting better phrasing while maintaining the author's voice and intent.`,
  tasks: `You are Presidium AI's Task Creator. You extract actionable tasks from messages and conversations. Format tasks clearly with priority levels and assignees when mentioned.`,
  code: `You are Presidium AI's Code Helper. You review code, suggest improvements, explain code behavior, and help debug issues. Provide code in markdown code blocks with language hints.`,
  insights: `You are Presidium AI's Insights feature. You analyze communication patterns, provide analytics, and offer actionable insights about conversations and productivity.`,
  briefing: `You are Presidium AI's Daily Briefing feature. You provide a concise morning briefing summarizing unread messages, pending tasks, meetings, and important updates. Be structured and actionable.`,
};

// Zod validation schemas
const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required').max(4096, 'Message too long (max 4096 characters)'),
  conversationId: z.string().min(1, 'Conversation ID is required'),
  mode: z.enum(['default', 'summarize', 'reply', 'meeting', 'translation', 'writing', 'tasks', 'code', 'insights', 'briefing']).optional().default('default'),
});

/**
 * Get AI provider from env (default: 'glm4')
 */
function getAIProvider(): 'glm4' {
  // Only GLM-4 supported now
  return 'glm4';
}

/**
 * Call GLM-4 API
 */
async function callAI(messages: GLM4Message[]): Promise<string> {
  const provider = getAIProvider();
  
  if (provider === 'glm4') {
    return callGLM4(messages);
  }
  
  throw new Error('No AI provider configured. Set GLM4_API_KEY in environment');
}

function getConversationKey(userId: string, conversationId: string, mode: string): string {
  return `${userId}::${conversationId}::${mode}`;
}

function getOrCreateConversation(userId: string, conversationId: string, mode: string = 'default'): ChatMessage[] {
  const key = getConversationKey(userId, conversationId, mode);
  if (!conversations.has(key)) {
    const systemPrompt = SYSTEM_PROMPTS[mode] || SYSTEM_PROMPTS.default;
    conversations.set(key, [
      { role: 'system', content: systemPrompt },
    ]);
  }
  const history = conversations.get(key);
  if (!history) {
    throw new Error('Failed to initialize conversation history');
  }
  return history;
}

/**
 * Persist conversation messages to Prisma DB
 */
async function persistMessagesToDb(
  conversationId: string,
  userId: string,
  userMessage: string,
  aiResponse: string,
  mode: string
) {
  try {
    // Find or create the conversation
    const existing = await db.aIConversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userId: true },
    });

    if (!existing) {
      // Create conversation in DB
      const title = userMessage.slice(0, 50) + (userMessage.length > 50 ? '...' : '');
      await db.aIConversation.create({
        data: {
          id: conversationId,
          userId,
          title,
          mode,
          lastMessage: aiResponse.slice(0, 100),
          messages: {
            create: [
              {
                role: 'user',
                content: userMessage,
                timestamp: new Date().toISOString(),
              },
              {
                role: 'assistant',
                content: aiResponse,
                timestamp: new Date().toISOString(),
              },
            ],
          },
        },
      });
    } else {
      if (existing.userId !== userId) {
        throw new Error('Forbidden conversation access');
      }

      // Add messages to existing conversation
      await db.aIConversationMessage.createMany({
        data: [
          {
            conversationId,
            role: 'user',
            content: userMessage,
            timestamp: new Date().toISOString(),
          },
          {
            conversationId,
            role: 'assistant',
            content: aiResponse,
            timestamp: new Date().toISOString(),
          },
        ],
      });
      // Update lastMessage
      await db.aIConversation.update({
        where: { id: conversationId },
        data: {
          lastMessage: aiResponse.slice(0, 100),
        },
      });
    }
  } catch (error) {
    console.error('Failed to persist AI conversation to DB:', error);
    // Non-blocking — don't fail the request if DB persistence fails
  }
}

/**
 * GET /api/ai-chat - List AI conversations (with messages) for current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to view AI conversations.' },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const limitRaw = searchParams.get('limit');
    const limit = Math.min(Math.max(parseInt(limitRaw || '50', 10) || 50, 1), 200);

    if (conversationId) {
      const conversation = await db.aIConversation.findFirst({
        where: {
          id: conversationId,
          userId,
        },
        include: {
          messages: {
            orderBy: { timestamp: 'asc' },
          },
        },
      });

      if (!conversation) {
        return NextResponse.json(
          { error: 'Conversation not found' },
          { status: 404 },
        );
      }

      const item: ConversationListItem = {
        id: conversation.id,
        title: conversation.title,
        mode: conversation.mode || 'default',
        lastMessage: conversation.lastMessage || '',
        updatedAt: conversation.updatedAt.toISOString(),
        messages: conversation.messages.map((msg) => ({
          id: msg.id,
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
          timestamp: msg.timestamp,
        })),
      };

      return NextResponse.json({
        success: true,
        conversations: [item],
      });
    }

    const conversations = await db.aIConversation.findMany({
      where: { userId },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    const items: ConversationListItem[] = conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      mode: conversation.mode || 'default',
      lastMessage: conversation.lastMessage || '',
      updatedAt: conversation.updatedAt.toISOString(),
      messages: conversation.messages.map((msg) => ({
        id: msg.id,
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
        timestamp: msg.timestamp,
      })),
    }));

    return NextResponse.json({
      success: true,
      conversations: items,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to load AI conversations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const isDevOrLan = process.env.NODE_ENV !== 'production';
    const isAuthenticated = Boolean(session?.user?.id);
    const allowAnonymousAI =
      isDevOrLan || process.env.ALLOW_ANON_AI === 'true';

    const requestIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'local';
    const requestUa = request.headers.get('user-agent') || 'unknown';
    const anonymousUserId = `anon:${Buffer.from(`${requestIp}:${requestUa.slice(0, 64)}`)
      .toString('base64url')
      .slice(0, 24)}`;

    const userId = session?.user?.id || (allowAnonymousAI ? anonymousUserId : null);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to use AI chat.' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const parseResult = chatRequestSchema.safeParse(body);
    
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { message, conversationId, mode } = parseResult.data;

    // Rate limiting: 10 requests per 10 seconds per user+conversation
    const rateLimitResult = rateLimit(`ai-chat:${userId}:${conversationId}`, {
      maxRequests: 10,
      windowMs: 10000,
    });

    if (!rateLimitResult.success) {
      return NextResponse.json(
        { 
          error: 'Too many requests',
          retryAfter: rateLimitResult.retryAfter,
          message: `Please wait ${rateLimitResult.retryAfter} seconds before sending another message`
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
            'Retry-After': rateLimitResult.retryAfter?.toString() || '10',
          }
        }
      );
    }

    // Get or create conversation in memory
    const history = getOrCreateConversation(userId, conversationId, mode);
    const convKey = getConversationKey(userId, conversationId, mode);

    // Add user message to history
    history.push({ role: 'user', content: message });

    // Trim if too many messages (keep system + last 20)
    if (history.length > 21) {
      const system = history[0];
      const trimmed = [system, ...history.slice(-20)];
      conversations.set(convKey, trimmed);
    }

    // Call GLM-4 AI
    const aiResponse = await callAI(history);

    // Add AI response to history
    history.push({ role: 'assistant', content: aiResponse });

    // Persist to database if userId is provided (fire and forget)
    if (isAuthenticated && session?.user?.id) {
      persistMessagesToDb(conversationId, session.user.id, message, aiResponse, mode || 'default')
        .catch(err => console.error('DB persistence error:', err));
    }

    // Add rate limit headers to response
    const headers = {
      'X-RateLimit-Limit': '10',
      'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
      'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
    };

    return NextResponse.json({
      success: true,
      response: aiResponse,
      messageCount: history.length - 1,
    }, { headers });
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

    if (
      error instanceof Error &&
      /GLM-4 API error:\s*401/i.test(error.message)
    ) {
      return NextResponse.json(
        {
          error:
            'AI provider rejected the API key (401). Re-check GLM4_API_KEY and provider account access.',
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const isDevOrLan = process.env.NODE_ENV !== 'production';
    const allowAnonymousAI =
      isDevOrLan || process.env.ALLOW_ANON_AI === 'true';

    const requestIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'local';
    const requestUa = request.headers.get('user-agent') || 'unknown';
    const anonymousUserId = `anon:${Buffer.from(`${requestIp}:${requestUa.slice(0, 64)}`)
      .toString('base64url')
      .slice(0, 24)}`;

    const userId = session?.user?.id || (allowAnonymousAI ? anonymousUserId : null);
    const isAuthenticated = Boolean(session?.user?.id);

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized. Please sign in to manage AI chats.' },
        { status: 401 }
      );
    }
    const { conversationId } = await request.json();
    
    // Validate
    if (!conversationId || typeof conversationId !== 'string') {
      return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 });
    }
    
    // Delete from in-memory store
    const prefix = `${userId}::${conversationId}::`;
    for (const key of conversations.keys()) {
      if (key.startsWith(prefix)) {
        conversations.delete(key);
      }
    }

    // Delete only conversations owned by the current user
    if (isAuthenticated) {
      await db.aIConversation.deleteMany({
        where: { id: conversationId, userId },
      });
    }
    
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete conversation' }, { status: 500 });
  }
}

