/**
 * Message Reactions UI Component
 *
 * Shows reaction groups below a message bubble.
 * Tap to add/remove reaction.
 * Long press to open full emoji picker.
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SmilePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  addReaction,
  removeReaction,
  getMessageReactions,
  DEFAULT_QUICK_REACTIONS,
  type ReactionGroup,
} from '@/lib/reactions';

interface MessageReactionsProps {
  messageId: string;
  currentUserId: string;
  isMe: boolean;
  onReactionChange?: (reactions: ReactionGroup[]) => void;
  className?: string;
}

export function MessageReactions({
  messageId,
  currentUserId,
  isMe,
  onReactionChange,
  className,
}: MessageReactionsProps) {
  const [reactions, setReactions] = useState<ReactionGroup[]>(() =>
    getMessageReactions(messageId, currentUserId),
  );
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const handleReaction = useCallback(async (emoji: string) => {
    await addReaction(
      messageId,
      emoji,
      currentUserId,
      'Me',
    );

    const updated = getMessageReactions(messageId, currentUserId);
    setReactions(updated);
    onReactionChange?.(updated);
    setShowPicker(false);
  }, [messageId, currentUserId, onReactionChange]);

  const handleRemoveReaction = useCallback(async (emoji: string) => {
    await removeReaction(messageId, emoji, currentUserId);
    const updated = getMessageReactions(messageId, currentUserId);
    setReactions(updated);
    onReactionChange?.(updated);
  }, [messageId, currentUserId, onReactionChange]);

  if (reactions.length === 0 && !showPicker) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1 mt-1', className)}>
      {/* Existing reactions */}
      {reactions.map((group) => (
        <button
          key={group.emoji}
          onClick={() => {
            if (group.isOwn) {
              handleRemoveReaction(group.emoji);
            } else {
              handleReaction(group.emoji);
            }
          }}
          className={cn(
            'flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-all border',
            group.isOwn
              ? isMe
                ? 'bg-white/20 border-white/30 text-white'
                : 'bg-emerald-brand/10 border-emerald-brand/30 text-emerald-brand'
              : isMe
                ? 'bg-white/10 border-white/20 text-white/80 hover:bg-white/15'
                : 'bg-muted/50 border-border/50 text-foreground/80 hover:bg-muted',
          )}
        >
          <span className="text-sm leading-none">{group.emoji}</span>
          {group.count > 1 && (
            <span className="font-medium">{group.count}</span>
          )}
        </button>
      ))}

      {/* Add reaction button */}
      <div className="relative">
        <button
          onClick={() => setShowPicker(!showPicker)}
          className={cn(
            'flex items-center justify-center size-6 rounded-full transition-colors',
            isMe
              ? 'bg-white/10 text-white/60 hover:bg-white/15 hover:text-white/80'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          <SmilePlus className="size-3.5" />
        </button>

        {/* Quick reaction picker */}
        <AnimatePresence>
          {showPicker && (
            <motion.div
              ref={pickerRef}
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              className={cn(
                'absolute bottom-full left-0 mb-2 p-1.5 rounded-xl shadow-lg border flex gap-0.5',
                isMe
                  ? 'bg-gray-800 border-gray-700'
                  : 'bg-popover border-border',
              )}
              style={{ zIndex: 50 }}
            >
              {DEFAULT_QUICK_REACTIONS.map(({ emoji, label }) => (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className="size-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-lg transition-transform hover:scale-125"
                  title={label}
                >
                  {emoji}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
