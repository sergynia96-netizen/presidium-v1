import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { rateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { callGLM4, GLM4RateLimitError, type GLM4Message } from '@/lib/glm4';
import { createAssistantMessage } from '@/lib/messages';

const paramsSchema = z.object({
  botId: z.string().min(1).max(128),
});

const botMessageSchema = z.object({
  chatId: z.string().min(1).max(128),
  message: z.string().min(1).max(6000),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ botId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: 'Invalid bot id' }, { status: 400 });
    }
    const botId = parsedParams.data.botId;

    const limit = rateLimit(`bots:message:${session.user.id}:${botId}`, {
      maxRequests: 24,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many bot message requests', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const parsedBody = botMessageSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }

    const { chatId, message } = parsedBody.data;

    const bot = await db.bot.findUnique({
      where: { id: botId },
      select: {
        id: true,
        userId: true,
        name: true,
        prompt: true,
        avatarUrl: true,
      },
    });

    if (!bot) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    if (bot.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const member = await db.chatMember.findFirst({
      where: {
        chatId,
        userId: session.user.id,
      },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ error: 'Access denied to this chat' }, { status: 403 });
    }

    const glmMessages: GLM4Message[] = [
      {
        role: 'system',
        content: bot.prompt.trim(),
      },
      {
        role: 'user',
        content: message.trim(),
      },
    ];

    const aiResponse = await callGLM4(glmMessages);
    const content = aiResponse.trim().slice(0, 10000);
    if (!content) {
      return NextResponse.json({ error: 'AI response is empty' }, { status: 502 });
    }

    const createdMessage = await createAssistantMessage({
      chatId,
      senderId: session.user.id,
      senderName: bot.name,
      senderAvatar: bot.avatarUrl || '',
      content,
      type: 'ai',
    });

    return NextResponse.json({ success: true, message: createdMessage }, { status: 201 });
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
