'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  CheckCheck,
  Sparkles,
  Copy,
  Reply,
  Forward,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  Star,
  Zap,
  ShieldAlert,
  BellOff,
  History,
  Quote,
  CheckSquare,
  Square,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
} from '@/components/ui/context-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Message } from '@/types';
import { decryptMediaFile } from '@/lib/media';
import { base64ToBytes } from '@/lib/crypto/utils';
import { cn } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n';
import type { OutboxMessageIndicator } from '@/lib/message-outbox';
import { useAppStore } from '@/store/use-app-store';
import { OpenClawWarning } from './openclaw-warning';

// ─── OpenClaw moderation banner (reads from store) ───
function OpenClawModerationBanner({ messageId }: { messageId: string }) {
  const moderationResult = useAppStore((s) => s.moderationResults[messageId]);
  if (!moderationResult || moderationResult.isSafe) return null;
  return <OpenClawWarning messageId={messageId} result={moderationResult} />;
}

interface MessageBubbleProps {
  message: Message;
  showAvatar: boolean;
  isLastInGroup: boolean;
  showStatusLabel?: boolean;
  queueState?: OutboxMessageIndicator;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onCopy?: (message: Message) => void;
  onForward?: (message: Message) => void;
  onPin?: (message: Message) => void;
  onDelete?: (message: Message) => void;
  onSwipeReply?: (message: Message) => void;
  onToggleSelect?: (message: Message) => void;
  onViewHistory?: (message: Message) => void;
  onQuoteSegment?: (message: Message) => void;
  selected?: boolean;
  selectionMode?: boolean;
  showReadBy?: boolean;
  resolveUserName?: (id: string) => string;
  contentProtection?: boolean;
}

function getStatusIcon(status: Message['status']) {
  switch (status) {
    case 'sending':
      return <div className="size-3.5 animate-spin rounded-full border border-current border-t-transparent opacity-50" />;
    case 'sent':
      return <Check className="size-3.5 opacity-50" />;
    case 'delivered':
      return <CheckCheck className="size-3.5 opacity-50" />;
    case 'read':
      return <CheckCheck className="size-3.5 text-blue-400" />;
    default:
      return null;
  }
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatFileSize(bytes?: number) {
  if (!bytes || Number.isNaN(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getStatusLabel(status: Message['status'], t: (key: TranslationKey) => string): string {
  switch (status) {
    case 'sending':
      return t('msg.status.sending');
    case 'sent':
      return t('msg.status.sent');
    case 'delivered':
      return t('msg.status.delivered');
    case 'read':
      return t('msg.status.read');
    default:
      return status;
  }
}

function getQueueLabel(
  queueState: OutboxMessageIndicator,
  t: (key: TranslationKey) => string,
  tf: (key: TranslationKey, params: Record<string, string | number>) => string,
): string {
  if (queueState.state === 'retrying') {
    return tf('outbox.messageRetrying', { attempts: Math.max(1, queueState.attempts) });
  }
  return t('outbox.messageQueued');
}

export function MessageBubble({
  message,
  showAvatar,
  isLastInGroup,
  showStatusLabel = false,
  queueState,
  onReply,
  onEdit,
  onCopy,
  onForward,
  onPin,
  onDelete,
  onSwipeReply,
  onToggleSelect,
  onViewHistory,
  onQuoteSegment,
  selected = false,
  selectionMode = false,
  showReadBy = false,
  resolveUserName,
  contentProtection = false,
}: MessageBubbleProps) {
  const { t, tf } = useT();
  const [displayMediaUrl, setDisplayMediaUrl] = useState<string | undefined>(message.mediaUrl);
  const touchStartXRef = useRef<number | null>(null);
  const swipeTriggeredRef = useRef(false);
  
  useEffect(() => {
    // If we have an e2e key and a URL that is a remote fetch, decrypt it!
    if (message.mediaUrl && message.e2eMedia && !displayMediaUrl?.startsWith('blob:')) {
      const decrypt = async () => {
        try {
          const res = await fetch(message.mediaUrl!);
          const blob = await res.blob();
          const encryptedBuf = new Uint8Array(await blob.arrayBuffer());
          const decryptedBlob = await decryptMediaFile({
            id: message.id,
            type: message.type,
            mimeType: message.mediaMimeType || 'application/octet-stream',
            name: message.mediaName || 'e2e-media',
            size: message.mediaSize || 0,
            encryptedData: encryptedBuf,
            iv: base64ToBytes(message.e2eMedia!.iv),
            tag: base64ToBytes(message.e2eMedia!.tag),
            encryptionKey: base64ToBytes(message.e2eMedia!.key),
          });
          const url = URL.createObjectURL(decryptedBlob);
          setDisplayMediaUrl(url);
        } catch (e) {
          console.error('[E2E Decrypt] Media decryption failed:', e);
        }
      };
      decrypt();
    }
  }, [message.mediaUrl, message.e2eMedia, displayMediaUrl, message.id, message.type, message.mediaMimeType, message.mediaName, message.mediaSize]);

  useEffect(() => {
    return () => {
       if (displayMediaUrl && displayMediaUrl.startsWith('blob:') && displayMediaUrl !== message.mediaUrl) {
          URL.revokeObjectURL(displayMediaUrl);
       }
    };
  }, [displayMediaUrl, message.mediaUrl]);

  const isMe = message.isMe;
  const isSystem = message.type === 'system';
  const isAI = message.type === 'ai';
  const isOpenClaw = message.type === 'openclaw';
      const isImageAttachment = Boolean(displayMediaUrl && message.mediaType === 'image');
  const isVideoAttachment = Boolean(
    displayMediaUrl &&
      ((message.mediaType === 'file' && typeof message.mediaMimeType === 'string' && message.mediaMimeType.startsWith('video/')) ||
        message.type === 'video-circle'),
  );
  const isFileAttachment = Boolean(
    displayMediaUrl &&
      message.mediaType === 'file' &&
      !(typeof message.mediaMimeType === 'string' && message.mediaMimeType.startsWith('video/')),
  );
  const isAudioAttachment = Boolean(displayMediaUrl && (message.mediaType === 'audio' || message.type === 'voice'));
  const hasKnownAttachmentRenderer = isImageAttachment || isVideoAttachment || isFileAttachment || isAudioAttachment;
  const isDeleted = Boolean(message.isDeleted);
  const editCount = message.editHistory?.length || 0;
  const getReplyPreviewText = (value: Message) => {
    if (!value.replyTo) return '';
    const content = (value.replyTo.content || '').trim();
    if (content) return content;
    if (value.replyTo.type === 'media') return t('common.attachment');
    if (value.replyTo.type === 'voice') return t('common.voiceMessage');
    return t('common.message');
  };
  const getForwardPreviewText = (value: Message) => {
    if (!value.forwardedFrom) return '';
    const content = (value.forwardedFrom.content || '').trim();
    if (content) return content;
    if (value.forwardedFrom.type === 'media') return t('common.attachment');
    if (value.forwardedFrom.type === 'voice') return t('common.voiceMessage');
    return t('common.message');
  };

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="rounded-full bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
          {message.content}
        </span>
      </div>
    );
  }

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
    swipeTriggeredRef.current = false;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (swipeTriggeredRef.current) return;
    const startX = touchStartXRef.current;
    if (startX == null) return;
    const currentX = event.touches[0]?.clientX ?? startX;
    const deltaX = currentX - startX;
    if (deltaX > 72 && onSwipeReply && !selectionMode && !isDeleted) {
      swipeTriggeredRef.current = true;
      onSwipeReply(message);
    }
  };

  const handleTouchEnd = () => {
    touchStartXRef.current = null;
    swipeTriggeredRef.current = false;
  };

  const readByUsers = (message.readBy || [])
    .filter((id) => id !== message.senderId)
    .map((id) => (resolveUserName ? resolveUserName(id) : id))
    .filter((value) => value && value.trim().length > 0);

  const readByLabel =
    readByUsers.length > 2
      ? `${readByUsers.slice(0, 2).join(', ')} +${readByUsers.length - 2}`
      : readByUsers.join(', ');
  const copyBlocked = contentProtection && !message.isMe;
  const forwardBlocked = contentProtection && !message.isMe;

  const bubbleContent = (
    <motion.div
      className={cn('message-stack group flex gap-2', isMe ? 'flex-row-reverse' : 'flex-row')}
      data-me={isMe}
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {selectionMode && (
        <button
          type="button"
          onClick={() => onToggleSelect?.(message)}
          className="mt-2 flex size-6 shrink-0 items-center justify-center text-muted-foreground"
          aria-label={selected ? t('aria.unselectMessage') : t('aria.selectMessage')}
        >
          {selected ? <CheckSquare className="size-4 text-primary" /> : <Square className="size-4" />}
        </button>
      )}
      {/* Avatar area */}
      {!isMe && (
        <div className="w-8 shrink-0">
          {showAvatar ? (
            <Avatar className="size-8">
              <AvatarFallback className="bg-surface-secondary text-xs font-medium">
                {getInitials(message.senderName)}
              </AvatarFallback>
            </Avatar>
          ) : null}
        </div>
      )}

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[75%] sm:max-w-[65%]',
          !showAvatar && !isMe && 'ml-10',
          !isLastInGroup && 'mt-0.5'
        )}
      >
        {/* Sender name */}
        {showAvatar && !isMe && !isAI && !isOpenClaw && (
          <p className="mb-1 ml-1 text-xs font-medium text-muted-foreground">
            {message.senderName}
          </p>
        )}

        {/* AI sender label */}
        {isAI && (
          <div className="mb-1 ml-1 flex items-center gap-1">
            <Sparkles className="size-3 text-amber-ai" />
            <span className="text-xs font-semibold text-amber-ai">{t('msg.aiSender')}</span>
          </div>
        )}
        {isOpenClaw && (
          <div className="mb-1 ml-1 flex items-center gap-1">
            <Zap className="size-3 text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{t('msg.openclawSender')}</span>
          </div>
        )}

        {/* Message bubble */}
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
            isOpenClaw && 'border border-emerald-500/20 bg-emerald-500/5 text-foreground',
            isAI && !isOpenClaw && 'border border-amber-ai/20 bg-amber-ai/5 text-foreground',
            isMe && !isAI && !isOpenClaw && 'bg-bubble-me text-bubble-me-foreground',
            !isMe && !isAI && !isOpenClaw && 'bg-bubble-other text-bubble-other-foreground',
            isMe && isLastInGroup && 'rounded-br-md',
            !isMe && isLastInGroup && 'rounded-bl-md',
            !isLastInGroup && isMe && 'rounded-br-sm',
            !isLastInGroup && !isMe && 'rounded-bl-sm'
          )}
        >
          {message.forwardedFrom && (
            <div
              className={cn(
                'mb-2 rounded-lg border-l-2 px-2.5 py-2',
                isMe
                  ? 'border-bubble-me-foreground/50 bg-bubble-me-foreground/10'
                  : 'border-muted-foreground/40 bg-muted/40',
              )}
            >
              <p className="truncate text-[10px] font-semibold">
                {t('msg.forwardedLabel')} {message.forwardedFrom.senderName}
              </p>
              <p className="truncate text-[11px] opacity-80">{getForwardPreviewText(message)}</p>
            </div>
          )}

          {message.replyTo && (
            <div
              className={cn(
                'mb-2 rounded-lg border-l-2 px-2.5 py-2',
                isMe
                  ? 'border-bubble-me-foreground/50 bg-bubble-me-foreground/10'
                  : 'border-muted-foreground/40 bg-muted/40',
              )}
            >
              <p className="truncate text-[10px] font-semibold">{message.replyTo.senderName}</p>
              <p className="truncate text-[11px] opacity-80">{getReplyPreviewText(message)}</p>
            </div>
          )}

          {message.quoteSegment && (
            <div
              className={cn(
                'mb-2 rounded-lg border-l-2 px-2.5 py-2 text-[11px]',
                isMe
                  ? 'border-bubble-me-foreground/50 bg-bubble-me-foreground/10'
                  : 'border-muted-foreground/40 bg-muted/40',
              )}
            >
              <p className="font-semibold">{t('msg.quoteSegment')}</p>
              <p className="opacity-80">
                {message.quoteSegment.label}
                {message.quoteSegment.note ? ` · ${message.quoteSegment.note}` : ''}
              </p>
            </div>
          )}

          {isDeleted && (
            <div className="mb-1 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 px-3 py-2 text-xs italic text-muted-foreground">
              {message.deletedForEveryone ? t('msg.deletedForEveryone') : t('msg.deleted')}
            </div>
          )}

          {!isDeleted && isImageAttachment && (
            <a href={displayMediaUrl} target="_blank" rel="noreferrer" className="mb-2 block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayMediaUrl}
                alt={message.mediaName || t('common.image')}
                className="max-h-72 w-full rounded-xl object-cover"
              />
            </a>
          )}

          {!isDeleted && isVideoAttachment && (
              <div className="mb-2 overflow-hidden rounded-xl border border-border/70 bg-background/70">
                <video
                  controls
                  preload="metadata"
                  src={displayMediaUrl}
                  className="max-h-80 w-full"
                />
                <div className="px-3 py-2">
                  <p className="truncate text-xs font-semibold">{message.mediaName || t('common.attachment')}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {[message.mediaMimeType, formatFileSize(message.mediaSize)].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
            )}

          {!isDeleted && isFileAttachment && (
              <a
                href={displayMediaUrl}
                target="_blank"
                rel="noreferrer"
                className="mb-2 block rounded-xl border border-border/70 bg-background/70 px-3 py-2 hover:bg-background"
              >
                <p className="truncate text-xs font-semibold">{message.mediaName || t('common.attachment')}</p>
                <p className="text-[10px] text-muted-foreground">
                  {[message.mediaMimeType, formatFileSize(message.mediaSize)].filter(Boolean).join(' · ')}
                </p>
              </a>
            )}

          {!isDeleted && isAudioAttachment && (
            <div className="mb-2 rounded-xl border border-border/70 bg-background/70 px-3 py-2">
              <audio controls preload="metadata" src={displayMediaUrl} className="w-full max-w-xs" />
              {message.mediaName && <p className="mt-1 truncate text-[10px] text-muted-foreground">{message.mediaName}</p>}
            </div>
          )}

          {!isDeleted && message.mediaUrl && !hasKnownAttachmentRenderer && (
            <a
              href={displayMediaUrl}
              target="_blank"
              rel="noreferrer"
              className="mb-2 block rounded-xl border border-border/70 bg-background/70 px-3 py-2 hover:bg-background"
            >
              <p className="truncate text-xs font-semibold">{message.mediaName || t('common.attachment')}</p>
              <p className="text-[10px] text-muted-foreground">
                {[message.mediaMimeType, formatFileSize(message.mediaSize)].filter(Boolean).join(' · ')}
              </p>
            </a>
          )}

          {!isAudioAttachment && message.content}
        </div>

        {/* Timestamp and status */}
        <div
          className={cn(
            'mt-1 flex items-center gap-1.5 px-1',
            isMe ? 'flex-row-reverse' : 'flex-row'
          )}
        >
          <span className="text-[10px] text-muted-foreground/70">
            {message.timestamp}
          </span>
          {message.isEdited && <span className="text-[10px] text-muted-foreground/70">{t('msg.edited')}</span>}
          {message.isEdited && editCount > 0 && (
            <span className="text-[10px] text-muted-foreground/70">({editCount})</span>
          )}
          {message.silent && <BellOff className="size-3 text-muted-foreground/70" />}
          {message.isPinned && <Pin className="size-3 text-muted-foreground/70" />}
          {isMe && (
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70">
              {getStatusIcon(message.status)}
              {showStatusLabel && (
                <span aria-label={`${t('aria.messageStatus')}: ${getStatusLabel(message.status, t)}`}>
                  {getStatusLabel(message.status, t)}
                </span>
              )}
            </span>
          )}
          {isMe && queueState && (
            <span
              className="inline-flex items-center rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300"
              aria-label={`${t('aria.messageQueueState')}: ${getQueueLabel(queueState, t, tf)}`}
            >
              {getQueueLabel(queueState, t, tf)}
            </span>
          )}
        </div>

        {showReadBy && isMe && readByUsers.length > 0 && (
          <p className="px-1 text-[10px] text-muted-foreground/70">
            {tf('msg.readBy', { users: readByLabel })}
          </p>
        )}

        {/* AI action chips */}
        {message.aiActions && message.aiActions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.aiActions.map((action) => (
              <button
                key={action}
                className="flex items-center gap-1 rounded-full border border-amber-ai/25 bg-amber-ai/8 px-2.5 py-1 text-[11px] font-medium text-amber-ai transition-colors hover:bg-amber-ai/15"
              >
                <Sparkles className="size-3" />
                {action}
              </button>
            ))}
          </div>
        )}

        {message.openClawActions && message.openClawActions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.openClawActions.map((action) => (
              <button
                key={action}
                type="button"
                className="flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/8 px-2.5 py-1 text-[11px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/15 dark:text-emerald-400"
              >
                <Zap className="size-3" />
                {action}
              </button>
            ))}
          </div>
        )}

        {message.moderationFlags && message.moderationFlags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.moderationFlags.map((flag, idx) => (
              <span
                key={`${flag.category}-${idx}`}
                className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-1 text-[10px] text-destructive"
              >
                <ShieldAlert className="size-3" />
                {flag.category}
              </span>
            ))}
          </div>
        )}

        {/* OpenClaw moderation warning */}
        <OpenClawModerationBanner messageId={message.id} />

      </div>
    </motion.div>
  );

  if (selectionMode) {
    return bubbleContent;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{bubbleContent}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem className="gap-2.5" disabled={!onReply} onClick={() => onReply?.(message)}>
          <Reply className="size-4" />
          {t('msg.reply')}
        </ContextMenuItem>
        <ContextMenuItem className="gap-2.5" disabled={!onEdit} onClick={() => onEdit?.(message)}>
          <Pencil className="size-4" />
          {t('msg.edit')}
        </ContextMenuItem>
        <ContextMenuItem className="gap-2.5" disabled={!onCopy || copyBlocked} onClick={() => onCopy?.(message)}>
          <Copy className="size-4" />
          {t('msg.copy')}
        </ContextMenuItem>
        <ContextMenuItem className="gap-2.5" disabled={!onForward || forwardBlocked} onClick={() => onForward?.(message)}>
          <Forward className="size-4" />
          {t('msg.forward')}
        </ContextMenuItem>
        <ContextMenuItem className="gap-2.5" disabled={!onToggleSelect} onClick={() => onToggleSelect?.(message)}>
          <CheckSquare className="size-4" />
          {t('msg.select')}
        </ContextMenuItem>
        <ContextMenuItem className="gap-2.5" disabled={!onPin} onClick={() => onPin?.(message)}>
          {message.isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          {message.isPinned ? t('msg.unpin') : t('msg.pin')}
        </ContextMenuItem>
        <ContextMenuItem
          className="gap-2.5"
          disabled={!onQuoteSegment || !message.mediaUrl}
          onClick={() => onQuoteSegment?.(message)}
        >
          <Quote className="size-4" />
          {t('msg.quoteSegment')}
        </ContextMenuItem>
        <ContextMenuItem
          className="gap-2.5"
          disabled={!onViewHistory || !message.isEdited}
          onClick={() => onViewHistory?.(message)}
        >
          <History className="size-4" />
          {t('msg.editHistory')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2.5">
            <Star className="size-4 text-amber-ai" />
            {t('msg.aiActions')}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem className="gap-2.5">
              <Sparkles className="size-4 text-amber-ai" />
              {t('ai.summarize')}
            </ContextMenuItem>
            <ContextMenuItem className="gap-2.5">
              <Sparkles className="size-4 text-amber-ai" />
              {t('ai.translate')}
            </ContextMenuItem>
            <ContextMenuItem className="gap-2.5">
              <Sparkles className="size-4 text-amber-ai" />
              {t('ai.replyForMe')}
            </ContextMenuItem>
            <ContextMenuItem className="gap-2.5">
              <Sparkles className="size-4 text-amber-ai" />
              {t('ai.createTask')}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="gap-2.5 text-red-500 focus:text-red-500"
          disabled={!onDelete}
          onClick={() => onDelete?.(message)}
        >
            <Trash2 className="size-4" />
            {t('msg.delete')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }
