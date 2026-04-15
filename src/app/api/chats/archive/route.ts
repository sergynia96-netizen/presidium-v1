import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { z } from 'zod';

const archiveSchema = z.object({
  chatId: z.string().cuid(),
  archived: z.boolean(),
});

/**
 * POST /api/chats/archive
 * Archive or unarchive a chat for the current user.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parseResult = archiveSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const { chatId, archived } = parseResult.data;

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

    // Update archive status
    await db.chatMember.updateMany({
      where: {
        userId: session.user.id,
        chatId,
      },
      data: {
        isArchived: archived,
        archivedAt: archived ? new Date() : null,
      },
    });

    return NextResponse.json({ success: true, archived });
  } catch (error) {
    console.error('Archive error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
