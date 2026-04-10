import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';

const querySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  mode: z.enum(['all', 'hashtag', 'mention', 'date']).default('all'),
  chatId: z.string().cuid().optional(),
  dateFrom: z.coerce.number().int().optional(),
  dateTo: z.coerce.number().int().optional(),
});

type SearchItem = {
  type: 'message' | 'chat' | 'contact' | 'group' | 'channel';
  id: string;
  title: string;
  subtitle?: string;
  avatar?: string;
  highlightedText?: string;
  timestamp?: number;
  chatId?: string;
  messageId?: string;
};

function snippet(content: string | null | undefined, query: string): string | undefined {
  if (!content) return undefined;
  const normalized = content.toLowerCase();
  const target = query.toLowerCase();
  const index = normalized.indexOf(target);
  if (index < 0) return content.slice(0, 120);
  const start = Math.max(0, index - 24);
  const end = Math.min(content.length, index + target.length + 24);
  return `${start > 0 ? '...' : ''}${content.slice(start, end)}${end < content.length ? '...' : ''}`;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limitByUser = rateLimit(`search:${session.user.id}`, {
      maxRequests: 90,
      windowMs: 60 * 1000,
    });
    if (!limitByUser.success) {
      return NextResponse.json({ error: 'Too many search requests. Please slow down.' }, { status: 429 });
    }

    const parsed = querySchema.safeParse({
      q: request.nextUrl.searchParams.get('q') || '',
      limit: request.nextUrl.searchParams.get('limit') || undefined,
      mode: request.nextUrl.searchParams.get('mode') || undefined,
      chatId: request.nextUrl.searchParams.get('chatId') || undefined,
      dateFrom: request.nextUrl.searchParams.get('dateFrom') || undefined,
      dateTo: request.nextUrl.searchParams.get('dateTo') || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 });
    }

    const { q, limit, mode, chatId, dateFrom, dateTo } = parsed.data;
    const normalizedQuery = q.trim();
    const contains = { contains: normalizedQuery, mode: 'insensitive' as const };
    const isSpecialMode = mode !== 'all';
    const hashQuery = normalizedQuery.startsWith('#') ? normalizedQuery : `#${normalizedQuery.replace(/^#/, '')}`;
    const mentionQuery = normalizedQuery.startsWith('@') ? normalizedQuery : `@${normalizedQuery.replace(/^@/, '')}`;

    const createdAtFilter =
      mode === 'date'
        ? {
            gte: typeof dateFrom === 'number' ? new Date(dateFrom) : undefined,
            lte: typeof dateTo === 'number' ? new Date(dateTo) : undefined,
          }
        : undefined;

    if (mode === 'date' && typeof dateFrom !== 'number' && typeof dateTo !== 'number') {
      return NextResponse.json({ error: 'dateFrom or dateTo is required for mode=date' }, { status: 400 });
    }

    const messageWhere: Record<string, unknown> = {
      chat: {
        members: {
          some: { userId: session.user.id },
        },
      },
    };

    if (chatId) {
      messageWhere.chatId = chatId;
    }

    if (mode === 'hashtag') {
      messageWhere.content = { contains: hashQuery, mode: 'insensitive' };
    } else if (mode === 'mention') {
      messageWhere.content = { contains: mentionQuery, mode: 'insensitive' };
    } else {
      messageWhere.OR = [
        { content: contains },
        { senderName: contains },
        { mediaName: contains },
      ];
    }

    if (createdAtFilter) {
      messageWhere.createdAt = createdAtFilter;
    }

    const [chatMembers, contactMatches, userMatches, messageMatches] = await Promise.all([
      isSpecialMode
        ? Promise.resolve([])
        : db.chatMember.findMany({
            where: {
              userId: session.user.id,
              chat: {
                OR: [
                  { name: contains },
                  { messages: { some: { content: contains } } },
                ],
              },
            },
            include: {
              chat: {
                include: {
                  messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1,
                  },
                },
              },
            },
            orderBy: { joinedAt: 'desc' },
            take: limit,
          }),
      isSpecialMode
        ? Promise.resolve([])
        : db.contact.findMany({
            where: {
              userId: session.user.id,
              OR: [
                { name: contains },
                { contact: { name: contains } },
                { contact: { email: contains } },
                { contact: { username: contains } },
              ],
            },
            include: {
              contact: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  avatar: true,
                  username: true,
                },
              },
            },
            orderBy: [{ isFavorite: 'desc' }, { updatedAt: 'desc' }],
            take: limit,
          }),
      isSpecialMode
        ? Promise.resolve([])
        : db.user.findMany({
            where: {
              id: { not: session.user.id },
              OR: [
                { username: contains },
                { name: contains },
                { email: contains },
              ],
            },
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              username: true,
              updatedAt: true,
            },
            orderBy: { updatedAt: 'desc' },
            take: limit,
          }),
      db.message.findMany({
        where: messageWhere,
        include: {
          chat: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
          sender: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    const chatResults: SearchItem[] = chatMembers.map((member) => {
      const chatType = member.chat.type === 'group' ? 'group' : member.chat.type === 'channel' ? 'channel' : 'chat';
      return {
        type: chatType,
        id: member.chat.id,
        title: member.chat.name,
        subtitle: member.chat.messages[0]?.content || '',
        avatar: member.chat.avatar || '',
        timestamp: member.chat.messages[0]?.createdAt.getTime() || member.chat.updatedAt.getTime(),
        chatId: member.chat.id,
      };
    });

    const contactResults: SearchItem[] = contactMatches.map((item) => ({
      type: 'contact',
      id: item.contact.id,
      title: item.name || item.contact.name,
      subtitle: item.contact.username ? `@${item.contact.username}` : item.contact.email,
      avatar: item.contact.avatar || '',
      timestamp: item.updatedAt.getTime(),
    }));

    const discoveryResults: SearchItem[] = userMatches.map((user) => ({
      type: 'contact',
      id: user.id,
      title: user.name,
      subtitle: user.username ? `@${user.username}` : user.email,
      avatar: user.avatar || '',
      timestamp: user.updatedAt.getTime(),
    }));

    const highlightQuery = mode === 'hashtag' ? hashQuery : mode === 'mention' ? mentionQuery : normalizedQuery;

    const messageResults: SearchItem[] = messageMatches.map((message) => ({
      type: 'message',
      id: message.id,
      title: message.content || message.mediaName || 'Attachment',
      subtitle: `${message.senderName || message.sender?.name || 'Unknown'} • ${message.chat.name}`,
      avatar: message.senderAvatar || message.sender?.avatar || '',
      highlightedText: snippet(message.content, highlightQuery),
      timestamp: message.createdAt.getTime(),
      chatId: message.chat.id,
      messageId: message.id,
    }));

    const deduplicated = new Map<string, SearchItem>();
    for (const item of [...messageResults, ...chatResults, ...contactResults, ...discoveryResults]) {
      const key = `${item.type}:${item.id}`;
      if (!deduplicated.has(key)) {
        deduplicated.set(key, item);
      }
    }

    const results = Array.from(deduplicated.values())
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, limit);

    return NextResponse.json({
      success: true,
      results,
      count: results.length,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
