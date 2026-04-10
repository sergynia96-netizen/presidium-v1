'use client';

import { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Lock, Shield, Sparkles, Bell, BellOff, Pin } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAppStore } from '@/store/use-app-store';
import { cn } from '@/lib/utils';
import type { Chat } from '@/types';

interface ChatListItemProps {
  chat: Chat;
  onLongPress?: () => void;
  onClick?: () => void;
}

const avatarColors = [
  'bg-emerald-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-violet-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-orange-500',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function ChatListItem({ chat, onLongPress, onClick }: ChatListItemProps) {
  const setActiveChat = useAppStore((s) => s.setActiveChat);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const [isPressed, setIsPressed] = useState(false);

  const isUnread = chat.unreadCount > 0;
  const isGroup = chat.type === 'group';
  const isAI = chat.type === 'ai';

  let avatarContent: React.ReactNode;
  let avatarBg: string;

  if (isAI) {
    avatarBg = 'bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300';
    avatarContent = <Sparkles className="size-5" />;
  } else if (isGroup) {
    avatarBg = `${getAvatarColor(chat.name)} text-white`;
    avatarContent = getInitials(chat.name);
  } else {
    avatarBg = `${getAvatarColor(chat.name)} text-white`;
    avatarContent = getInitials(chat.name);
  }

  const encryptionIcon = (() => {
    if (!chat.isEncrypted) return null;
    if (chat.encryptionType === 'p2p') {
      return <Shield className="size-3 text-emerald-500" />;
    }
    return <Lock className="size-3 text-emerald-500" />;
  })();

  const handlePointerDown = useCallback(() => {
    setIsPressed(true);
    if (onLongPress) {
      longPressTimer.current = setTimeout(() => {
        onLongPress();
        setIsPressed(false);
      }, 500);
    }
  }, [onLongPress]);

  const handlePointerUp = useCallback(() => {
    setIsPressed(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
    setIsPressed(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  return (
    <motion.div
      className={cn(
        'flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors rounded-xl mx-2',
        isPressed ? 'bg-accent' : 'hover:bg-accent/50'
      )}
      whileTap={{ scale: 0.98 }}
      onClick={() => {
        if (onClick) {
          onClick();
          return;
        }
        setActiveChat(chat.id);
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <Avatar className="size-12">
          <AvatarFallback
            className={`text-sm font-semibold ${avatarBg}`}
          >
            {avatarContent}
          </AvatarFallback>
        </Avatar>
        {chat.online && (
          <span className="absolute bottom-0 right-0 size-3 bg-emerald-500 rounded-full border-2 border-background" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h3
            className={`text-sm truncate ${
              isUnread ? 'font-bold text-foreground' : 'font-medium text-foreground/80'
            }`}
          >
            {chat.name}
          </h3>
          {encryptionIcon}
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {chat.lastMessage}
        </p>
      </div>

      {/* Meta */}
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="flex items-center gap-1">
          {chat.isPinned && (
            <Pin className="size-3 text-muted-foreground/60" />
          )}
          {chat.isMuted && (
            <BellOff className="size-3 text-muted-foreground/60" />
          )}
          {chat.notificationLevel === 'mentions' && !chat.isMuted && (
            <Bell className="size-3 text-muted-foreground/60" />
          )}
          <span className="text-[11px] text-muted-foreground">
            {chat.lastMessageTime}
          </span>
        </div>
        {isUnread && (
          <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold">
            {chat.unreadCount}
          </span>
        )}
      </div>
    </motion.div>
  );
}
