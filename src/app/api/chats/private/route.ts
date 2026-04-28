import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';

import { authOptions } from '@/lib/auth-options';
import { rateLimit } from '@/lib/rate-limit';
import {
  CanonicalPrivateChatError,
  createCanonicalPrivateChat,
} from '@/lib/server/relay-private-chat';

const createPrivateChatSchema = z.object({
  recipientId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized', code: 'NO_WEB_SESSION' },
        { status: 401 },
      );
    }

    const limit = rateLimit(`chats:private:create:${session.user.id}`, {
      maxRequests: 20,
      windowMs: 60 * 1000,
    });

    if (!limit.success) {
      return NextResponse.json(
        { success: false, error: 'Too many chat creation requests', code: 'RATE_LIMITED' },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = createPrivateChatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid input',
          code: 'VALIDATION_ERROR',
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }

    const chat = await createCanonicalPrivateChat(session.user, parsed.data.recipientId);

    return NextResponse.json({
      success: true,
      chat: {
        id: chat.chatId,
        type: 'private',
        memberIds: chat.memberIds,
        mode: 'canonical_postgres',
      },
      reused: chat.reused,
    });
  } catch (error) {
    if (error instanceof CanonicalPrivateChatError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create private chat',
        code: 'PRIVATE_CHAT_CREATE_FAILED',
      },
      { status: 500 },
    );
  }
}
