'use client';

import { useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Pin,
  PinOff,
  Bell,
  BellOff,
  BellRing,
  Eye,
  Archive,
  ExternalLink,
  Trash2,
  Eraser,
  Ban,
  X,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useAppStore } from '@/store/use-app-store';
import { useT } from '@/lib/i18n';
import type { TranslationKey } from '@/lib/i18n';

interface ChatContextMenuProps {
  chatId: string;
  isOpen: boolean;
  onClose: () => void;
}

interface MenuItem {
  labelKey?: TranslationKey;
  label?: string;
  icon: React.ElementType;
  action: () => void;
  destructive?: boolean;
}

export default function ChatContextMenu({ chatId, isOpen, onClose }: ChatContextMenuProps) {
  const { t } = useT();
  const {
    chats,
    blockedChatIds,
    togglePin,
    toggleMute,
    setChatNotificationLevel,
    markUnread,
    archiveChat,
    restoreChat,
    chatFolders,
    toggleChatInFolder,
    clearChat,
    deleteChat,
    blockChat,
    unblockChat,
  } = useAppStore();

  const isBlocked = useMemo(
    () => blockedChatIds.includes(chatId),
    [blockedChatIds, chatId]
  );

  const chat = useMemo(
    () => chats.find((c) => c.id === chatId),
    [chats, chatId]
  );

  const handleAction = useCallback(
    (action: () => void) => {
      action();
      onClose();
    },
    [onClose]
  );

  const menuItems: MenuItem[] = useMemo(() => {
    if (!chat) return [];

    const items: MenuItem[] = [
      {
        labelKey: chat.isPinned ? 'ctx.unpin' : 'ctx.pin',
        icon: chat.isPinned ? PinOff : Pin,
        action: () => togglePin(chatId),
      },
      {
        labelKey: chat.isMuted ? 'ctx.unmute' : 'ctx.mute',
        icon: chat.isMuted ? Bell : BellOff,
        action: () => toggleMute(chatId),
      },
      {
        label:
          `${t('ctx.notificationLevel')}: ` +
          (chat.notificationLevel === 'mentions'
            ? t('ctx.notificationMentions')
            : chat.notificationLevel === 'muted'
              ? t('ctx.notificationMuted')
              : t('ctx.notificationAll')),
        icon: BellRing,
        action: () => setChatNotificationLevel(chatId, 'all'),
      },
      {
        label: `${t('ctx.notificationLevel')}: ${t('ctx.notificationMentions')}`,
        icon: Bell,
        action: () => setChatNotificationLevel(chatId, 'mentions'),
      },
      {
        label: `${t('ctx.notificationLevel')}: ${t('ctx.notificationMuted')}`,
        icon: BellOff,
        action: () => setChatNotificationLevel(chatId, 'muted'),
      },
      {
        labelKey: 'ctx.markUnread',
        icon: Eye,
        action: () => markUnread(chatId),
      },
      {
        labelKey: chat.isArchived ? 'ctx.restoreFromArchive' : 'ctx.archive',
        icon: Archive,
        action: () => (chat.isArchived ? restoreChat(chatId) : archiveChat(chatId)),
      },
      {
        labelKey: 'ctx.newWindow',
        icon: ExternalLink,
        action: () => {
          if (typeof window === 'undefined') return;
          const url = new URL(window.location.href);
          url.searchParams.set('chatId', chatId);
          window.open(url.toString(), '_blank', 'noopener,noreferrer');
        },
      },
      {
        labelKey: 'ctx.clearChat',
        icon: Eraser,
        action: () => clearChat(chatId),
      },
    ];

    for (const folder of chatFolders) {
      const assigned = folder.chatIds.includes(chatId);
      items.push({
        label: assigned ? `${t('ctx.removeFromFolder')}: ${folder.name}` : `${t('ctx.addToFolder')}: ${folder.name}`,
        icon: assigned ? X : Pin,
        action: () => toggleChatInFolder(chatId, folder.id),
      });
    }

    return items;
  }, [chat, chatFolders, chatId, togglePin, toggleMute, setChatNotificationLevel, markUnread, restoreChat, archiveChat, clearChat, toggleChatInFolder, t]);

  const destructiveItems: MenuItem[] = useMemo(
    () => [
      {
        labelKey: isBlocked ? 'ctx.unblock' : 'ctx.block',
        icon: Ban,
        action: () => {
          if (isBlocked) {
            unblockChat(chatId);
          } else {
            blockChat(chatId);
          }
        },
        destructive: !isBlocked,
      },
      {
        labelKey: 'ctx.deleteChat',
        icon: Trash2,
        action: () => deleteChat(chatId),
        destructive: true,
      },
    ],
    [chatId, deleteChat, blockChat, unblockChat, isBlocked]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="fixed inset-0 z-[100]"
            onClick={onClose}
          />

          {/* Menu */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -5 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed inset-0 z-[101] flex items-center justify-center p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full max-w-[280px] rounded-xl border bg-card p-1.5 shadow-xl shadow-black/10">
              {/* Header */}
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-medium text-foreground">
                  {chat?.name}
                </span>
                <button
                  onClick={onClose}
                  className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              <Separator className="my-1" />

              {/* Regular menu items */}
              <div className="flex flex-col py-1">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.labelKey || item.label}
                      onClick={() => handleAction(item.action)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span>{item.label || t(item.labelKey as TranslationKey)}</span>
                    </button>
                  );
                })}
              </div>

              <Separator className="my-1" />

              {/* Destructive items */}
              <div className="flex flex-col py-1">
                {destructiveItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.labelKey}
                      onClick={() => handleAction(item.action)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-red-500 transition-colors hover:bg-red-500/10"
                    >
                      <Icon className="size-4 shrink-0" />
                      <span>{t(item.labelKey as TranslationKey)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>
  );
}
