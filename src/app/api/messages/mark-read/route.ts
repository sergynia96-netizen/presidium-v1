import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { z } from 'zod';

const markReadSchema = z.object({
  chatId: z.string().cuid(),
});

/**
 * POST /api/messages/mark-read
 * Mark all messages in a chat as read for the current user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parseResult = markReadSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const { chatId } = parseResult.data;

    // Verify user is a member of the chat
    const membership = await db.chatMember.findUnique({
      where: {
        userId_chatId: {
          userId: session.user.id,
          chatId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this chat' }, { status: 403 });
    }

    // Mark all messages (not sent by user) as read
    const now = new Date();
    await db.message.updateMany({
      where: {
        chatId,
        senderId: { not: session.user.id },
        status: { not: 'read' },
      },
      data: {
        status: 'read',
        readAt: now,
      },
    });

    // Reset unread count for this user's membership
    // (In a more complex setup, track per-user unread; here we use the chat's unreadCount)

    return NextResponse.json({ success: true, markedAt: now.toISOString() });
  } catch (error) {
    console.error('Mark read error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
