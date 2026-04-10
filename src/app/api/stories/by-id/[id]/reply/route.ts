import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { cleanupExpiredStories, isVisibleToUser } from '@/lib/stories-server';

const replySchema = z.object({
  content: z.string().min(1).max(2000),
});

async function getOrCreatePrivateChat(userA: string, userB: string) {
  const existing = await db.chat.findFirst({
    where: {
      type: 'private',
      members: {
        some: { userId: userA },
      },
      AND: [
        {
          members: {
            some: { userId: userB },
          },
        },
      ],
    },
    include: {
      members: {
        select: { userId: true },
      },
    },
  });

  if (existing) {
    const memberIds = new Set(existing.members.map((m) => m.userId));
    if (!memberIds.has(userA)) {
      await db.chatMember.create({ data: { chatId: existing.id, userId: userA } });
    }
    if (!memberIds.has(userB)) {
      await db.chatMember.create({ data: { chatId: existing.id, userId: userB } });
    }
    return existing.id;
  }

  const chat = await db.chat.create({
    data: {
      type: 'private',
      name: 'Direct chat',
      isEncrypted: true,
      encryptionType: 'e2e',
      members: {
        create: [{ userId: userA }, { userId: userB }],
      },
    },
    select: { id: true },
  });

  return chat.id;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`stories:reply:${session.user.id}`, {
      maxRequests: 40,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json({ error: 'Too many story replies' }, { status: 429 });
    }

    const parse = replySchema.safeParse(await request.json());
    if (!parse.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parse.error.flatten() }, { status: 400 });
    }

    const { id } = await params;
    await cleanupExpiredStories();

    const story = await db.story.findUnique({
      where: { id },
      select: {
        id: true,
        creatorId: true,
        creatorName: true,
        privacy: true,
        allowedUserIds: true,
        expiresAt: true,
        deletedAt: true,
      },
    });

    if (!story || story.deletedAt || story.expiresAt <= new Date()) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }

    const canView = await isVisibleToUser(story, session.user.id);
    if (!canView) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const targetUserId = story.creatorId;
    const senderId = session.user.id;
    const chatId = await getOrCreatePrivateChat(senderId, targetUserId);

    const sender = await db.user.findUnique({
      where: { id: senderId },
      select: { name: true, avatar: true },
    });

    const message = await db.message.create({
      data: {
        chatId,
        senderId,
        senderName: sender?.name || session.user.name || session.user.email || 'User',
        senderAvatar: sender?.avatar || '',
        content: parse.data.content.trim(),
        type: 'text',
        status: 'sent',
        isMe: false,
      },
      select: {
        id: true,
        chatId: true,
        content: true,
      },
    });

    await db.chat.update({
      where: { id: chatId },
      data: {
        lastMessage: message.content,
        lastMessageTime: new Date().toISOString(),
        updatedAt: new Date(),
      },
    });

    await db.storyReply.create({
      data: {
        storyId: story.id,
        fromUserId: senderId,
        toUserId: targetUserId,
        content: parse.data.content.trim(),
        messageId: message.id,
      },
    });

    await db.story.update({
      where: { id: story.id },
      data: {
        replyCount: { increment: 1 },
      },
    });

    return NextResponse.json({ success: true, chatId, messageId: message.id });
  } catch {
    return NextResponse.json({ error: 'Failed to send story reply' }, { status: 500 });
  }
}
