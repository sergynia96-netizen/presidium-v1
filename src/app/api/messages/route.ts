import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

const messageTypeSchema = z.enum([
  'text',
  'system',
  'ai',
  'openclaw',
  'voice',
  'video-circle',
  'media',
  'image',
  'video',
  'file',
]);

const mediaTypeSchema = z.enum(['image', 'file', 'audio']);

const mediaUrlSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => value.startsWith('/') || /^https?:\/\//i.test(value), {
    message: 'mediaUrl must be a relative (/uploads/...) or absolute http(s) URL',
  });

const replyPreviewSchema = z.object({
  id: z.string().min(1).max(128),
  senderName: z.string().min(1).max(120),
  content: z.string().max(280),
  type: messageTypeSchema,
});

const forwardedPreviewSchema = z.object({
  id: z.string().min(1).max(128),
  senderName: z.string().min(1).max(120),
  content: z.string().max(280),
  type: messageTypeSchema,
  fromChatName: z.string().max(120).optional(),
});

const createMessageSchema = z
  .object({
    id: z.string().min(1).max(128).optional(),
    chatId: z.string().min(1).max(128),
    content: z.string().min(1).max(10000),
    type: messageTypeSchema.optional().default('text'),
    mediaUrl: mediaUrlSchema.optional(),
    mediaType: mediaTypeSchema.optional(),
    mediaName: z.string().min(1).max(255).optional(),
    mediaSize: z.number().int().min(0).max(100 * 1024 * 1024).optional(),
    mediaMimeType: z.string().min(1).max(255).optional(),
    replyTo: replyPreviewSchema.optional(),
    forwardedFrom: forwardedPreviewSchema.optional(),
    isEncrypted: z.boolean().optional().default(false),
    anonymousAdmin: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.mediaType && !data.mediaUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mediaUrl'],
        message: 'mediaUrl is required when mediaType is provided',
      });
    }
  });

type ModerationSeverity = 'low' | 'medium' | 'high';

interface ModerationFlag {
  category: string;
  severity: ModerationSeverity;
  description: string;
}

const SERVER_MODERATION_RULES: Array<{
  category: string;
  regex: RegExp;
  description: string;
}> = [
  { category: 'extremism', regex: /\b(extremis|radicali[sz]e|hate group)\b/i, description: 'Extremist intent detected' },
  { category: 'terrorism', regex: /\b(terroris|bomb making|suicide attack|ieds?)\b/i, description: 'Terror-related intent detected' },
  { category: 'fascism', regex: /\b(fascis|nazi propaganda|heil hitler)\b/i, description: 'Fascist propaganda detected' },
  { category: 'drug_business', regex: /\b(sell drugs|drug trafficking|cocaine for sale|meth lab)\b/i, description: 'Drug trade intent detected' },
  { category: 'violence', regex: /\b(mass shooting|how to attack|kill them)\b/i, description: 'Violent intent detected' },
  { category: 'pornography', regex: /\b(child porn|non-consensual porn|revenge porn)\b/i, description: 'Prohibited sexual content detected' },
  { category: 'fraud', regex: /\b(credit card scam|phishing kit|wire fraud)\b/i, description: 'Fraud-related intent detected' },
  { category: 'banditism', regex: /\b(armed robbery|carjacking|home invasion)\b/i, description: 'Banditism-related intent detected' },
  { category: 'murder', regex: /\b(how to murder|hire a hitman|murder plan)\b/i, description: 'Murder-related intent detected' },
  { category: 'criminal_activity', regex: /\b(organized crime|money laundering|human trafficking)\b/i, description: 'Serious criminal activity detected' },
];

function serverModerate(content: string): { blocked: boolean; flags: ModerationFlag[] } {
  const flags = SERVER_MODERATION_RULES
    .filter((rule) => rule.regex.test(content))
    .map((rule) => ({
      category: rule.category,
      severity: 'high' as const,
      description: rule.description,
    }));
  return { blocked: flags.length > 0, flags };
}

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
 * GET /api/messages - List messages for a chat
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;

    if (!chatId) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
    }

    const chatMember = await db.chatMember.findFirst({
      where: {
        chatId,
        userId: session.user.id,
      },
    });

    if (!chatMember) {
      return NextResponse.json({ error: 'Access denied to this chat' }, { status: 403 });
    }

    const [messages, total] = await Promise.all([
      db.message.findMany({
        where: { chatId },
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
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      db.message.count({ where: { chatId } }),
    ]);

    messages.reverse();

    return NextResponse.json({
      messages: messages.map((msg) => mapMessageForResponse(msg)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + messages.length < total,
      },
    });
  } catch (error: unknown) {
    console.error('List messages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/messages - Send a new message
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = rateLimit(`messages:create:${session.user.id}`, {
      maxRequests: 120,
      windowMs: 60 * 1000,
    });
    if (!limit.success) {
      return NextResponse.json(
        { error: 'Too many messages sent. Please wait a moment.' },
        { status: 429 },
      );
    }

    const body = await request.json();
    const parseResult = createMessageSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.flatten() },
        { status: 400 },
      );
    }

    const {
      id,
      chatId,
      content,
      type,
      mediaUrl,
      mediaType,
      mediaName,
      mediaSize,
      mediaMimeType,
      replyTo,
      forwardedFrom,
      isEncrypted,
      anonymousAdmin,
    } = parseResult.data;

    // E2E/P2P payloads must never be persisted by the server API.
    // They must flow only through relay with client-side storage.
    if (isEncrypted) {
      return NextResponse.json(
        {
          error: 'E2E messages are not persisted server-side',
          code: 'e2e_server_storage_disabled',
        },
        { status: 410 },
      );
    }

    const moderation = serverModerate(content);
    if (moderation.blocked) {
      return NextResponse.json(
        {
          error: 'Message blocked by server moderation',
          flags: moderation.flags,
        },
        { status: 403 },
      );
    }

    const chatMember = await db.chatMember.findFirst({
      where: {
        chatId,
        userId: session.user.id,
      },
      include: {
        chat: {
          select: { type: true },
        },
      },
    });

    if (!chatMember) {
      return NextResponse.json({ error: 'Access denied to this chat' }, { status: 403 });
    }

    const canPostAnonymousAdmin =
      Boolean(anonymousAdmin) &&
      chatMember.chat.type === 'group' &&
      (chatMember.role === 'owner' || chatMember.role === 'admin');

    if (anonymousAdmin && !canPostAnonymousAdmin) {
      return NextResponse.json(
        { error: 'Anonymous admin posting requires group admin role' },
        { status: 403 },
      );
    }

    if (id) {
      const existing = await db.message.findUnique({
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
        },
      });

      if (existing) {
        if (existing.chatId !== chatId) {
          return NextResponse.json({ error: 'Message id conflict' }, { status: 409 });
        }
        return NextResponse.json(
          {
            success: true,
            message: mapMessageForResponse(existing),
          },
          { status: 200 },
        );
      }
    }

    const message = await db.message.create({
      data: {
        ...(id ? { id } : {}),
        chatId,
        senderId: session.user.id,
        senderName: canPostAnonymousAdmin ? 'Anonymous Admin' : session.user.name || 'Anonymous',
        senderAvatar: canPostAnonymousAdmin ? '' : session.user.avatar || '',
        content,
        type,
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        mediaName: mediaName || null,
        mediaSize: mediaSize ?? null,
        mediaMimeType: mediaMimeType || null,
        isPinned: false,
        isEdited: false,
        replyToMessageId: replyTo?.id || null,
        replyToSenderName: replyTo?.senderName || null,
        replyToContent: replyTo?.content || null,
        replyToType: replyTo?.type || null,
        forwardedFromMessageId: forwardedFrom?.id || null,
        forwardedFromSenderName: forwardedFrom?.senderName || null,
        forwardedFromContent: forwardedFrom?.content || null,
        forwardedFromType: forwardedFrom?.type || null,
        forwardedFromChatName: forwardedFrom?.fromChatName || null,
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
        message: mapMessageForResponse(message),
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    console.error('Create message error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
