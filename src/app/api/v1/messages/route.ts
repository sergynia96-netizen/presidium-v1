import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { authenticateApiKey } from '@/lib/api-key-auth';

const createV1MessageSchema = z.object({
  chatId: z.string().min(1).max(128),
  content: z.string().min(1).max(10000),
  type: z.enum(['text']).optional().default('text'),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateApiKey(request, 'messages:write');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const forwarded = request.headers.get('x-forwarded-for');
    const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : 'unknown';
    const limit = rateLimit(`v1:messages:${auth.context.apiKeyId}:${ip}`, {
      maxRequests: 120,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many messages sent. Please wait a moment.', retryAfter: limit.retryAfter },
        { status: 429 },
      );
    }

    const parsed = createV1MessageSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { chatId, content, type } = parsed.data;

    const member = await db.chatMember.findFirst({
      where: {
        chatId,
        userId: auth.context.userId,
      },
      select: { id: true },
    });
    if (!member) {
      return NextResponse.json({ error: 'Access denied to this chat' }, { status: 403 });
    }

    const created = await db.message.create({
      data: {
        chatId,
        senderId: auth.context.userId,
        senderName: auth.context.userName || 'API User',
        senderAvatar: auth.context.userAvatar || '',
        content,
        type,
        status: 'sent',
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            status: true,
          },
        },
      },
    });

    await db.chat.update({
      where: { id: chatId },
      data: {
        lastMessage: content,
        lastMessageTime: new Date().toISOString(),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: {
          id: created.id,
          chatId: created.chatId,
          senderId: created.senderId,
          senderName: created.senderName,
          senderAvatar: created.senderAvatar,
          sender: created.sender,
          content: created.content,
          type: created.type,
          status: created.status,
          isMe: false,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        },
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
