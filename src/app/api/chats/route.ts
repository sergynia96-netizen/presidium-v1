import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import {
  CanonicalPrivateChatError,
  createCanonicalPrivateChat,
} from '@/lib/server/relay-private-chat';
import { z } from 'zod';

const createChatSchema = z
  .object({
    name: z.string().min(1).max(100),
    type: z.enum(['private', 'group']),
    avatar: z.string().optional(),
    memberIds: z.array(z.string()).min(1).optional(), // For group chats
    isEncrypted: z.boolean().optional().default(true),
    encryptionType: z.enum(['e2e', 'p2p', 'server']).optional().default('e2e'),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'private' && (!value.memberIds || value.memberIds.length !== 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['memberIds'],
        message: 'Private chat requires exactly one target memberId',
      });
    }
  });

/**
 * GET /api/chats - List user's chats
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    // Get all chats where user is a member
    const chatMembers = await db.chatMember.findMany({
      where: { userId: session.user.id },
      include: {
        chat: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    avatar: true,
                    status: true,
                    username: true,
                  },
                },
              },
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
      skip,
      take: limit,
    });

    const chats = chatMembers.map((member) => ({
      id: member.chat.id,
      type: member.chat.type,
      name: member.chat.name,
      avatar: member.chat.avatar,
      lastMessage: member.chat.messages[0]?.content || '',
      lastMessageTime: member.chat.messages[0]?.createdAt.toISOString() || '',
      unreadCount: 0, // TODO: Calculate from read receipts
      isPinned: false, // TODO: Add to ChatMember model
      isMuted: member.notificationLevel === 'MUTED',
      notificationLevel:
        member.notificationLevel === 'MENTIONS'
          ? 'mentions'
          : member.notificationLevel === 'MUTED'
            ? 'muted'
            : 'all',
      isArchived: member.isArchived,
      isEncrypted: member.chat.isEncrypted,
      encryptionType: member.chat.encryptionType,
      role: member.role,
      members: member.chat.members.map((m) => m.user),
      createdAt: member.chat.createdAt,
    }));

    const total = await db.chatMember.count({
      where: { userId: session.user.id },
    });

    return NextResponse.json({
      chats,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + chats.length < total,
      },
    });
  } catch (error: unknown) {
    console.error('List chats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/chats - Create a new chat
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const limit = rateLimit(`chats:create:${session.user.id}`, {
      maxRequests: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many chat creation requests. Please slow down.' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parseResult = createChatSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { name, type, avatar, memberIds, isEncrypted, encryptionType } = parseResult.data;
    const normalizedMemberIds = Array.from(
      new Set((memberIds || []).filter((id) => id !== session.user.id)),
    );

    if (type === 'private') {
      const targetId = normalizedMemberIds[0];
      if (!targetId) {
        return NextResponse.json(
          { error: 'Private chat requires a target memberId' },
          { status: 400 },
        );
      }

      try {
        const canonical = await createCanonicalPrivateChat(session.user, targetId);

        return NextResponse.json(
          {
            success: true,
            chat: {
              id: canonical.chatId,
              type: 'private',
              isEncrypted: true,
              encryptionType: 'e2e',
              mode: 'canonical_postgres',
              memberIds: canonical.memberIds,
            },
            reused: canonical.reused,
          },
          { status: canonical.reused ? 200 : 201 },
        );
      } catch (error) {
        if (error instanceof CanonicalPrivateChatError) {
          return NextResponse.json(
            { error: error.message, code: error.code },
            { status: error.status },
          );
        }
        return NextResponse.json(
          { error: 'Failed to create private chat', code: 'PRIVATE_CHAT_CREATE_FAILED' },
          { status: 500 },
        );
      }
    }

    // Create chat with members
    const chat = await db.chat.create({
      data: {
        name,
        type,
        avatar: avatar || '',
        isEncrypted,
        encryptionType,
        members: {
          create: [
            // Add current user as admin
            {
              userId: session.user.id,
              role: 'admin',
            },
            // Add other members for group chats
            ...(normalizedMemberIds.length > 0
              ? normalizedMemberIds.map((userId) => ({
                    userId,
                    role: 'member' as const,
                  }))
              : []),
          ],
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
                status: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        chat: {
          id: chat.id,
          name: chat.name,
          type: chat.type,
          avatar: chat.avatar,
          isEncrypted: chat.isEncrypted,
          encryptionType: chat.encryptionType,
          members: chat.members.map((m) => m.user),
          createdAt: chat.createdAt,
        },
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Create chat error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
