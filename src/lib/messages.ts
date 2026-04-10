import { db } from '@/lib/db';

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

export interface CreateAssistantMessageInput {
  chatId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  content: string;
  type?: 'ai' | 'openclaw';
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
    // Assistant messages should never be treated as local author messages in UI.
    isMe: false,
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

export async function createAssistantMessage(input: CreateAssistantMessageInput) {
  const message = await db.message.create({
    data: {
      chatId: input.chatId,
      senderId: input.senderId,
      senderName: input.senderName,
      senderAvatar: input.senderAvatar || '',
      content: input.content,
      type: input.type || 'ai',
      status: 'sent',
      isPinned: false,
      isEdited: false,
      mediaUrl: null,
      mediaType: null,
      mediaName: null,
      mediaSize: null,
      mediaMimeType: null,
      replyToMessageId: null,
      replyToSenderName: null,
      replyToContent: null,
      replyToType: null,
      forwardedFromMessageId: null,
      forwardedFromSenderName: null,
      forwardedFromContent: null,
      forwardedFromType: null,
      forwardedFromChatName: null,
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
    where: { id: input.chatId },
    data: {
      lastMessage: input.content,
      lastMessageTime: new Date().toISOString(),
    },
  });

  return mapMessageForResponse(message);
}
