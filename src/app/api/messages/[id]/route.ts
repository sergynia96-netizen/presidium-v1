import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const messageStatusSchema = z.enum(['sending', 'sent', 'delivered', 'read']);

const updateMessageSchema = z
  .object({
    content: z.string().min(1).max(10000).optional(),
    status: messageStatusSchema.optional(),
    isPinned: z.boolean().optional(),
  })
  .refine((data) => data.content !== undefined || data.status !== undefined || data.isPinned !== undefined, {
    message: 'At least one field must be provided',
  });

interface MessageWithSenderShape {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string;
  sender: {
    id: string;
    name: string;
    email: string;
    avatar: string;
    status: string;
  } | null;
  content: string;
  type: string;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaName: string | null;
  mediaSize: number | null;
  mediaMimeType: string | null;
  status: string;
  isPinned: boolean;
  isEdited: boolean;
  replyToMessageId: string | null;
  replyToSenderName: string | null;
  replyToContent: string | null;
  replyToType: string | null;
  forwardedFromMessageId: string | null;
  forwardedFromSenderName: string | null;
  forwardedFromContent: string | null;
  forwardedFromType: string | null;
  forwardedFromChatName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapMessageForResponse(message: MessageWithSenderShape) {
  const anonymousAdmin = message.senderName === 'Anonymous Admin';
  const senderId = anonymousAdmin ? 'anonymous-admin' : message.senderId;
  return {
    id: message.id,
    chatId: message.chatId,
    senderId,
    sender: anonymousAdmin ? null : message.sender,
    senderName: message.senderName,
    senderAvatar: anonymousAdmin ? '' : message.senderAvatar,
    anonymousAdmin,
    content: message.content,
    type: message.type,
    mediaUrl: message.mediaUrl,
    mediaType: message.mediaType ?? undefined,
    mediaName: message.mediaName ?? undefined,
    mediaSize: message.mediaSize ?? undefined,
    mediaMimeType: message.mediaMimeType ?? undefined,
    status: message.status,
    isPinned: message.isPinned,
    isEdited: message.isEdited,
    replyTo: message.replyToMessageId
      ? {
          id: message.replyToMessageId,
          senderName: message.replyToSenderName || 'Unknown',
          content: message.replyToContent || '',
          type: message.replyToType || 'text',
        }
      : undefined,
    forwardedFrom: message.forwardedFromMessageId
      ? {
          id: message.forwardedFromMessageId,
          senderName: message.forwardedFromSenderName || 'Unknown',
          content: message.forwardedFromContent || '',
          type: message.forwardedFromType || 'text',
          fromChatName: message.forwardedFromChatName || undefined,
        }
      : undefined,
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
  };
}

/**
 * GET /api/messages/[id] - Get single message
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

    const message = await db.message.findUnique({
      where: { id },
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
        chat: {
          select: {
            id: true,
            members: {
              where: { userId: session.user.id },
            },
          },
        },
      },
    });

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (message.chat.members.length === 0) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    return NextResponse.json({
      message: mapMessageForResponse(message),
    });
  } catch (error: unknown) {
    console.error('Get message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/messages/[id] - Update message (edit or status/pin update)
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

    const patchLimit = rateLimit(`messages:update:${session.user.id}`, {
      maxRequests: 120,
      windowMs: 60 * 1000,
    });
    if (!patchLimit.success) {
      return NextResponse.json(
        { error: 'Too many message updates. Please slow down.' },
        { status: 429 },
      );
    }

    const { id } = await params;
    const body = await request.json();
    const parseResult = updateMessageSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.flatten() },
        { status: 400 },
      );
    }

    const { content, status, isPinned } = parseResult.data;

    const message = await db.message.findUnique({
      where: { id },
      include: {
        chat: {
          select: {
            members: {
              where: { userId: session.user.id },
            },
          },
        },
      },
    });

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (message.chat.members.length === 0) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (content !== undefined && message.senderId !== session.user.id) {
      return NextResponse.json({ error: 'Only sender can edit message' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (content !== undefined) {
      updateData.content = content;
      updateData.isEdited = true;
    }
    if (status !== undefined) {
      updateData.status = status;
    }
    if (isPinned !== undefined) {
      updateData.isPinned = isPinned;
    }

    const updatedMessage = await db.message.update({
      where: { id },
      data: updateData,
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

    return NextResponse.json({
      success: true,
      message: mapMessageForResponse(updatedMessage),
    });
  } catch (error: unknown) {
    console.error('Update message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/messages/[id] - Delete message
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const deleteLimit = rateLimit(`messages:delete:${session.user.id}`, {
      maxRequests: 120,
      windowMs: 60 * 1000,
    });
    if (!deleteLimit.success) {
      return NextResponse.json(
        { error: 'Too many message deletions. Please slow down.' },
        { status: 429 },
      );
    }

    const { id } = await params;

    const message = await db.message.findUnique({
      where: { id },
      include: {
        chat: {
          select: {
            members: {
              where: { userId: session.user.id },
            },
          },
        },
      },
    });

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }

    if (message.chat.members.length === 0) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const chatMember = message.chat.members[0];
    if (message.senderId !== session.user.id && chatMember?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only sender or admin can delete message' },
        { status: 403 },
      );
    }

    await db.message.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Message deleted',
    });
  } catch (error: unknown) {
    console.error('Delete message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
