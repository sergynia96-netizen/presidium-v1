import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { z } from 'zod';

const draftSchema = z.object({
  content: z.string().max(10000),
});

/**
 * GET /api/chats/[id]/draft - Get draft for a chat
 * POST /api/chats/[id]/draft - Save draft for a chat
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const membership = await db.chatMember.findUnique({
      where: {
        userId_chatId: {
          userId: session.user.id,
          chatId: id,
        },
      },
      select: { draftContent: true, draftUpdatedAt: true },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Not a member of this chat' }, { status: 403 });
    }

    return NextResponse.json({
      content: membership.draftContent || null,
      updatedAt: membership.draftUpdatedAt || null,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
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
    const parseResult = draftSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const { content } = parseResult.data;

    const updated = await db.chatMember.updateMany({
      where: {
        userId: session.user.id,
        chatId: id,
      },
      data: {
        draftContent: content || null,
        draftUpdatedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: 'Not a member of this chat' }, { status: 403 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
