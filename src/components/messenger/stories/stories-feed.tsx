/**
 * Stories Feed Component
 *
 * Horizontal scrollable stories bar at the top of the chat list.
 * Similar to Telegram/Instagram stories.
 *
 * Features:
 * - Horizontal scroll with snap
 * - "Your Story" add button
 * - Unseen indicator (gradient ring)
 * - Seen indicator (gray ring)
 * - Tap to view full story
 */

'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ImageIcon, Video, Type } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { StoryGroup, StoryItem, StoryType, StoryPrivacy } from '@/lib/stories';
import { createStory, markStoryViewed } from '@/lib/stories';

interface StoriesFeedProps {
  stories: StoryGroup[];
  onStoryTap?: (group: StoryGroup, index: number) => void;
  onAddStory?: () => void;
  className?: string;
}

export function StoriesFeed({ stories, onStoryTap, onAddStory, className }: StoriesFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className={cn('shrink-0 border-b border-border/50 bg-background/50 backdrop-blur-sm', className)}>
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide px-4 py-3 snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* Your Story - Add button */}
        <button
          onClick={onAddStory}
          className="flex flex-col items-center gap-1.5 snap-start shrink-0"
        >
          <div className="relative">
            <Avatar className="size-16 border-2 border-dashed border-muted-foreground/30">
              <AvatarFallback className="bg-muted text-muted-foreground">
                <Plus className="size-5" />
              </AvatarFallback>
            </Avatar>
            {/* Plus badge */}
            <div className="absolute -bottom-1 -right-1 size-5 rounded-full bg-emerald-brand flex items-center justify-center border-2 border-background">
              <Plus className="size-3 text-white" />
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground max-w-[64px] truncate">
            Ваша история
          </span>
        </button>

        {/* Story groups */}
        {stories.map((group) => (
          <StoryThumbnail
            key={`${group.sourceType}:${group.sourceId}`}
            group={group}
            onTap={() => onStoryTap?.(group, 0)}
          />
        ))}
      </div>
    </div>
  );
}

interface StoryThumbnailProps {
  group: StoryGroup;
  onTap: () => void;
}

function StoryThumbnail({ group, onTap }: StoryThumbnailProps) {
  const initials = group.sourceName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <button
      onClick={onTap}
      className="flex flex-col items-center gap-1.5 snap-start shrink-0"
    >
      <div className="relative p-0.5">
        {/* Ring indicator */}
        <div
          className={cn(
            'absolute -inset-0.5 rounded-full',
            group.hasUnseen
              ? 'bg-gradient-to-tr from-emerald-brand to-cyan-400'
              : 'bg-gray-300 dark:bg-gray-600',
          )}
        />
        <Avatar className="relative size-16 border-2 border-background">
          {group.sourceAvatar ? (
            <img src={group.sourceAvatar} alt={group.sourceName} className="size-full object-cover" />
          ) : (
            <AvatarFallback className="text-sm font-medium">
              {initials}
            </AvatarFallback>
          )}
        </Avatar>

        {/* Story count badge */}
        {group.items.length > 1 && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-background/80 backdrop-blur-sm text-[9px] font-medium text-muted-foreground border border-border/50">
            {group.items.length}
          </div>
        )}
      </div>
      <span className="text-[10px] text-foreground max-w-[64px] truncate">
        {group.sourceName}
      </span>
    </button>
  );
}

// ─── Story Viewer ────────────────────────────────────────────────────────────

interface StoryViewerProps {
  group: StoryGroup;
  initialIndex: number;
  onClose: () => void;
  onReply: (storyId: string, content: string) => void;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function StoryViewer({ group, initialIndex, onClose, onReply }: StoryViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isPaused, setIsPaused] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [displayMediaUrl, setDisplayMediaUrl] = useState<string | undefined>(undefined);

  const currentStory = group.items[currentIndex];
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let canceled = false;
    let revokeUrl: string | null = null;

    const resolveMedia = async () => {
      if (!currentStory.mediaUrl) {
        setDisplayMediaUrl(undefined);
        return;
      }

      if (!currentStory.e2eMedia) {
        setDisplayMediaUrl(currentStory.mediaUrl);
        return;
      }

      try {
        const { decryptMediaFile } = await import('@/lib/media');
        const response = await fetch(currentStory.mediaUrl);
        if (!response.ok) throw new Error('Failed to fetch encrypted story media');
        const encryptedData = new Uint8Array(await response.arrayBuffer());
        const decryptedBlob = await decryptMediaFile({
          id: currentStory.id,
          type: currentStory.type,
          mimeType: currentStory.mediaMimeType || 'application/octet-stream',
          name: currentStory.mediaName || 'story-media',
          size: currentStory.mediaSize || encryptedData.length,
          encryptedData,
          iv: base64ToBytes(currentStory.e2eMedia.iv),
          tag: base64ToBytes(currentStory.e2eMedia.tag),
          encryptionKey: base64ToBytes(currentStory.e2eMedia.key),
        });

        const url = URL.createObjectURL(decryptedBlob);
        revokeUrl = url;
        if (!canceled) {
          setDisplayMediaUrl(url);
        }
      } catch {
        if (!canceled) {
          setDisplayMediaUrl(currentStory.mediaUrl);
        }
      }
    };

    void resolveMedia();
    return () => {
      canceled = true;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [
    currentStory.id,
    currentStory.mediaUrl,
    currentStory.e2eMedia,
    currentStory.mediaMimeType,
    currentStory.mediaName,
    currentStory.mediaSize,
    currentStory.type,
  ]);

  // Auto-advance timer
  const startTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (isPaused) return;

    timerRef.current = setTimeout(() => {
      if (currentIndex < group.items.length - 1) {
        setCurrentIndex(i => i + 1);
      } else {
        onClose();
      }
    }, 5000); // 5 seconds per story
  }, [currentIndex, group.items.length, isPaused, onClose]);

  React.useEffect(() => {
    startTimer();
    // Mark as viewed
    markStoryViewed(currentStory.id).catch(() => {});
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentIndex, currentStory.id, startTimer]);

  const handleNext = () => {
    if (currentIndex < group.items.length - 1) {
      setCurrentIndex(i => i + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(i => i - 1);
    }
  };

  const handleSendReply = () => {
    if (replyText.trim()) {
      onReply(currentStory.id, replyText.trim());
      setReplyText('');
      setShowReply(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black flex flex-col"
    >
      {/* Progress bars */}
      <div className="absolute top-0 left-0 right-0 z-10 flex gap-1 p-2">
        {group.items.map((_, i) => (
          <div
            key={i}
            className="flex-1 h-0.5 bg-white/30 rounded-full overflow-hidden"
          >
            <motion.div
              className="h-full bg-white rounded-full"
              initial={{ width: i < currentIndex ? '100%' : '0%' }}
              animate={{
                width: i === currentIndex ? '100%' : i < currentIndex ? '100%' : '0%',
              }}
              transition={{
                duration: i === currentIndex ? 5 : 0,
                ease: 'linear',
              }}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-6 left-0 right-0 z-10 flex items-center gap-3 px-4">
        <Avatar className="size-8">
          {group.sourceAvatar ? (
            <img src={group.sourceAvatar} alt="" className="size-full object-cover" />
          ) : (
            <AvatarFallback className="text-xs">
              {group.sourceName[0]}
            </AvatarFallback>
          )}
        </Avatar>
        <span className="text-white text-sm font-medium">{group.sourceName}</span>
        <span className="text-white/60 text-xs">
          {new Date(currentStory.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
        <button onClick={onClose} className="ml-auto text-white/80 hover:text-white">
          ✕
        </button>
      </div>

      {/* Story content */}
      <div
        className="flex-1 flex items-center justify-center relative"
        onPointerDown={() => setIsPaused(true)}
        onPointerUp={() => setIsPaused(false)}
        onPointerLeave={() => setIsPaused(false)}
      >
        {/* Tap zones */}
        <button
          onClick={handlePrev}
          className="absolute left-0 top-0 bottom-0 w-1/3 z-10"
          aria-label="Previous story"
        />
        <button
          onClick={handleNext}
          className="absolute right-0 top-0 bottom-0 w-1/3 z-10"
          aria-label="Next story"
        />

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStory.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="max-w-md w-full px-4"
          >
            {currentStory.type === 'image' && displayMediaUrl && (
              <img
                src={displayMediaUrl}
                alt="Story"
                className="w-full rounded-lg object-cover max-h-[70vh]"
              />
            )}
            {currentStory.type === 'video' && displayMediaUrl && (
              <video
                src={displayMediaUrl}
                autoPlay
                playsInline
                muted
                className="w-full rounded-lg object-cover max-h-[70vh]"
              />
            )}
            {currentStory.type === 'text' && (
              <div className="bg-gradient-to-br from-emerald-brand/20 to-cyan-400/20 rounded-2xl p-8 min-h-[300px] flex items-center justify-center">
                <p className="text-white text-xl text-center font-medium whitespace-pre-wrap">
                  {currentStory.content}
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Reply bar */}
      <div className="px-4 pb-6 pt-2">
        {showReply ? (
          <div className="flex gap-2">
            <input
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
              placeholder="Отправить ответ..."
              className="flex-1 bg-white/10 text-white placeholder:text-white/40 rounded-full px-4 py-2.5 text-sm outline-none focus:bg-white/15"
              autoFocus
            />
            <button
              onClick={handleSendReply}
              className="px-4 py-2.5 bg-emerald-brand text-white rounded-full text-sm font-medium hover:bg-emerald-600"
            >
              →
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowReply(true)}
            className="w-full bg-white/10 text-white/60 rounded-full px-4 py-2.5 text-sm hover:bg-white/15 hover:text-white/80 transition-colors"
          >
            Отправить ответ...
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ─── Story Creator ───────────────────────────────────────────────────────────

interface StoryCreatorProps {
  onClose: () => void;
  onCreated: (story: StoryItem) => void;
  sourceType: 'user' | 'group' | 'channel';
  sourceId: string;
}

export function StoryCreator({ onClose, onCreated, sourceType, sourceId }: StoryCreatorProps) {
  const [step, setStep] = useState<'type' | 'content' | 'privacy'>('type');
  const [storyType, setStoryType] = useState<StoryType>('text');
  const [content, setContent] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [privacy, setPrivacy] = useState<StoryPrivacy>('contacts');
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMediaFile(file);
      setStoryType(file.type.startsWith('video') ? 'video' : 'image');
      setStep('content');
    }
  };

  const handleCreate = async () => {
    if (!content.trim() && !mediaFile) return;

    setUploading(true);
    try {
      const story = await createStory({
        type: storyType,
        content: content.trim(),
        mediaBlob: mediaFile ? new Blob([mediaFile], { type: mediaFile.type }) : undefined,
        privacy,
        sourceType,
        sourceId,
      });

      onCreated(story);
    } catch (error) {
      console.error('Failed to create story:', error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50">
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          ✕
        </button>
        <h2 className="text-lg font-semibold flex-1">Новая история</h2>
        {step === 'content' && (
          <button
            onClick={handleCreate}
            disabled={uploading || (!content.trim() && !mediaFile)}
            className="px-4 py-1.5 bg-emerald-brand text-white rounded-full text-sm font-medium disabled:opacity-50 hover:bg-emerald-600"
          >
            {uploading ? '...' : 'Опубликовать'}
          </button>
        )}
      </div>

      {/* Step 1: Choose type */}
      {step === 'type' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
          <p className="text-muted-foreground text-center">Выберите тип истории</p>

          <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
            <button
              onClick={() => setStep('content')}
              className="flex flex-col items-center gap-2 p-6 rounded-2xl bg-muted/50 hover:bg-muted transition-colors"
            >
              <Type className="size-8 text-emerald-brand" />
              <span className="text-sm font-medium">Текст</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-2 p-6 rounded-2xl bg-muted/50 hover:bg-muted transition-colors"
            >
              <ImageIcon className="size-8 text-blue-500" />
              <span className="text-sm font-medium">Фото</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-2 p-6 rounded-2xl bg-muted/50 hover:bg-muted transition-colors"
            >
              <Video className="size-8 text-purple-500" />
              <span className="text-sm font-medium">Видео</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleMediaSelect}
          />
        </div>
      )}

      {/* Step 2: Content */}
      {step === 'content' && (
        <div className="flex-1 flex flex-col p-4 gap-4">
          {/* Media preview */}
          {mediaFile && (
            <div className="rounded-xl overflow-hidden bg-muted max-h-64 flex items-center justify-center">
              {mediaFile.type.startsWith('video') ? (
                <video
                  src={URL.createObjectURL(mediaFile)}
                  className="max-h-64 w-auto"
                  controls
                />
              ) : (
                <img
                  src={URL.createObjectURL(mediaFile)}
                  alt="Preview"
                  className="max-h-64 w-auto object-contain"
                />
              )}
            </div>
          )}

          {/* Text input */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Добавьте текст к истории..."
            className="flex-1 min-h-[120px] bg-transparent text-foreground placeholder:text-muted-foreground resize-none outline-none text-lg"
            maxLength={500}
          />

          {/* Character count */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep('privacy')}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Приватность: {privacy}
            </button>
            <span className="text-xs text-muted-foreground">{content.length}/500</span>
          </div>
        </div>
      )}

      {/* Step 3: Privacy */}
      {step === 'privacy' && (
        <div className="flex-1 p-4">
          <h3 className="text-lg font-semibold mb-4">Кто видит вашу историю</h3>
          <div className="space-y-2">
            {[
              { value: 'everyone' as StoryPrivacy, label: 'Все', desc: 'Любой пользователь' },
              { value: 'contacts' as StoryPrivacy, label: 'Контакты', desc: 'Только ваши контакты' },
              { value: 'close-friends' as StoryPrivacy, label: 'Близкие друзья', desc: 'Избранные контакты' },
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setPrivacy(option.value);
                  setStep('content');
                }}
                className={cn(
                  'w-full flex items-center gap-3 p-4 rounded-xl border transition-colors',
                  privacy === option.value
                    ? 'border-emerald-brand bg-emerald-brand/5'
                    : 'border-border/50 hover:bg-muted/50',
                )}
              >
                <div
                  className={cn(
                    'size-5 rounded-full border-2 flex items-center justify-center',
                    privacy === option.value
                      ? 'border-emerald-brand bg-emerald-brand'
                      : 'border-muted-foreground/30',
                  )}
                >
                  {privacy === option.value && (
                    <div className="size-2 rounded-full bg-white" />
                  )}
                </div>
                <div className="text-left">
                  <p className="font-medium">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
