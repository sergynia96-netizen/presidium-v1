import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { z } from 'zod';

const notificationLevelSchema = z.object({
  level: z.enum(['ALL', 'MENTIONS', 'MUTED']),
});

/**
 * PATCH /api/chats/[id]/notifications
 * Update notification level for a chat membership.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const body = await request.json();
    const parseResult = notificationLevelSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const { level } = parseResult.data;

    // Verify user is a member of the chat
    const membership = await db.chatMember.findUnique({
      where: {
        userId_chatId: {
          userId: session.user.id,
          chatId: id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this chat' }, { status: 403 });
    }

    await db.chatMember.updateMany({
      where: {
        userId: session.user.id,
        chatId: id,
      },
      data: {
        notificationLevel: level,
      },
    });

    return NextResponse.json({ success: true, level });
  } catch (error) {
    console.error('Update notification level error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
