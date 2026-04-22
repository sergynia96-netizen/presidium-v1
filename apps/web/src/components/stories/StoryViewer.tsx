/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 *
 * Full-screen story viewer:
 * - Auto-advance 5s per story
 * - Tap left/right to navigate
 * - Swipe down to close
 * - Progress bars per story group
 * - E2EE reply modal
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/hooks/useAuth';
import { type Story, useStories } from '@/hooks/useStories';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface StoryGroup {
  creatorId: string;
  creatorName: string;
  creatorAvatar?: string;
  items: Story[];
}

export function StoryViewer({
  groups,
  initialGroupIndex = 0,
  onClose,
}: {
  groups: StoryGroup[];
  initialGroupIndex?: number;
  onClose: () => void;
}) {
  const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
  const [itemIndex, setItemIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const touchStartY = useRef(0);
  const rafRef = useRef<number>(0);

  const { viewStory, replyToStory } = useStories();
  const { token } = useAuth();
  const router = useRouter();

  const currentGroup = groups[groupIndex];
  const currentStory = currentGroup?.items[itemIndex];
  const currentStoryId = currentStory?.id;

  const nextItem = useCallback(() => {
    if (!currentGroup) {
      return;
    }

    if (itemIndex < currentGroup.items.length - 1) {
      setItemIndex((idx) => idx + 1);
      return;
    }

    if (groupIndex < groups.length - 1) {
      setGroupIndex((idx) => idx + 1);
      setItemIndex(0);
      return;
    }

    onClose();
  }, [currentGroup, groupIndex, groups.length, itemIndex, onClose]);

  const prevItem = useCallback(() => {
    if (itemIndex > 0) {
      setItemIndex((idx) => idx - 1);
      return;
    }

    if (groupIndex > 0) {
      const prevGroupIdx = groupIndex - 1;
      setGroupIndex(prevGroupIdx);
      setItemIndex(groups[prevGroupIdx].items.length - 1);
    }
  }, [groupIndex, groups, itemIndex]);

  useEffect(() => {
    if (!currentStoryId || paused || showReply) {
      return;
    }

    setProgress(0);

    const startTime = performance.now();
    const duration = 5000;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const value = Math.min(elapsed / duration, 1);
      setProgress(value);

      if (value < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        nextItem();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [currentStoryId, groupIndex, itemIndex, nextItem, paused, showReply]);

  useEffect(() => {
    if (currentStory && !currentStory.hasViewed) {
      viewStory(currentStory.id).catch((err) => {
        console.error('[Stories] View tracking failed:', err);
      });
    }
  }, [currentStory, viewStory]);

  const handleTap = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const width = rect.width;

    if (x < width * 0.3) {
      prevItem();
      return;
    }

    if (x > width * 0.7) {
      nextItem();
    }
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartY.current = event.touches[0].clientY;
    setPaused(true);
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const diff = event.changedTouches[0].clientY - touchStartY.current;
    if (diff > 100) {
      onClose();
    }
    setPaused(false);
  };

  const handleReply = async () => {
    if (!currentStory || !replyText.trim()) {
      return;
    }

    setReplySending(true);
    try {
      const res = await fetch(`${API_URL}/users/${currentStory.creatorId}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      const publicKey = data?.data?.publicKey as string | undefined;
      if (!publicKey) {
        throw new Error('Recipient public key not found');
      }

      const result = await replyToStory(currentStory.id, publicKey, replyText.trim());
      setShowReply(false);
      setReplyText('');
      router.push(`/chat/${result.chatId}`);
    } catch (err) {
      console.error('[Stories] Reply failed:', err);
      alert('Failed to send reply');
    } finally {
      setReplySending(false);
    }
  };

  if (!currentStory || !currentGroup) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black"
      onClick={handleTap}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={() => setPaused(true)}
      onMouseUp={() => setPaused(false)}
    >
      <div className="absolute left-0 right-0 top-0 z-20 flex gap-1 p-2 pt-12">
        {currentGroup.items.map((_, idx) => (
          <div key={idx} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-white transition-all duration-100"
              style={{
                width:
                  idx < itemIndex ? '100%' : idx === itemIndex ? `${progress * 100}%` : '0%',
              }}
            />
          </div>
        ))}
      </div>

      <div className="absolute left-0 right-0 top-0 z-20 flex items-center gap-3 bg-gradient-to-b from-black/60 to-transparent p-4 pt-14">
        <div className="h-10 w-10 overflow-hidden rounded-full border-2 border-emerald-500 bg-slate-700">
          {currentGroup.creatorAvatar ? (
            <img src={currentGroup.creatorAvatar} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-bold text-white">
              {currentGroup.creatorName[0]}
            </div>
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-white">{currentGroup.creatorName}</p>
          <p className="text-xs text-white/60">
            {new Date(currentStory.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className="p-2 text-white/80 hover:text-white"
        >
          ✕
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center bg-black">
        {currentStory.type === 'text' && (
          <div className="max-w-lg p-8 text-center text-2xl font-medium text-white">
            {currentStory.content}
          </div>
        )}

        {currentStory.type === 'image' && currentStory.mediaUrl && (
          <img src={currentStory.mediaUrl} alt="Story" className="max-h-full max-w-full object-contain" />
        )}

        {currentStory.type === 'video' && currentStory.mediaUrl && (
          <video
            src={currentStory.mediaUrl}
            className="max-h-full max-w-full"
            autoPlay
            muted
            playsInline
            loop={false}
            onEnded={nextItem}
          />
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-white/80">
            <span>👁 {currentStory.views}</span>
            {currentStory.replyCount > 0 && <span>💬 {currentStory.replyCount}</span>}
          </div>

          {currentStory.replyPermission !== 'none' && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                setShowReply(true);
              }}
              className="rounded-full bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/30"
            >
              Reply
            </button>
          )}
        </div>
      </div>

      {showReply && (
        <div
          className="absolute inset-0 z-30 flex items-end bg-black/80 backdrop-blur"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="w-full space-y-3 rounded-t-2xl bg-slate-900 p-4">
            <p className="font-medium text-white">Reply to {currentGroup.creatorName}</p>
            <input
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              placeholder="Type encrypted reply..."
              className="w-full rounded-xl bg-slate-800 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowReply(false)}
                className="flex-1 rounded-xl bg-slate-700 py-3 font-medium text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleReply().catch((err) => console.error('[Stories] Reply error:', err));
                }}
                disabled={!replyText.trim() || replySending}
                className="flex-1 rounded-xl bg-emerald-600 py-3 font-medium text-white transition hover:bg-emerald-500 disabled:bg-slate-700"
              >
                {replySending ? 'Sending...' : 'Send E2EE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
