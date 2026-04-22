'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { type Story, useStories } from '@/hooks/useStories';
import { useAuth } from '@/hooks/useAuth';
import { StoryCreator } from './StoryCreator';
import { type StoryGroup, StoryViewer } from './StoryViewer';

export function StoryBar() {
  const { user } = useAuth();
  const { listStories } = useStories();
  const [stories, setStories] = useState<Story[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerGroupIndex, setViewerGroupIndex] = useState(0);

  const loadStories = useCallback(async () => {
    const data = await listStories();
    setStories(data);
  }, [listStories]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadStories().catch((err) => console.error('[StoryBar] Load failed:', err));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadStories]);

  const groups = useMemo(() => {
    const map = new Map<string, StoryGroup>();
    stories.forEach((story) => {
      const existing = map.get(story.creatorId);
      if (existing) {
        existing.items.push(story);
        return;
      }
      map.set(story.creatorId, {
        creatorId: story.creatorId,
        creatorName: story.creatorName,
        creatorAvatar: story.creatorAvatar,
        items: [story],
      });
    });
    return Array.from(map.values());
  }, [stories]);

  const openViewer = (groupIdx: number) => {
    setViewerGroupIndex(groupIdx);
    setViewerOpen(true);
  };

  const myStories = groups.find((group) => group.creatorId === user?.id);
  const otherGroups = groups.filter((group) => group.creatorId !== user?.id);
  const orderedGroups = myStories ? [myStories, ...otherGroups] : groups;

  return (
    <div className="space-y-4">
      <StoryCreator onCreated={loadStories} />

      <div className="flex gap-4 overflow-x-auto pb-4">
        {orderedGroups.map((group, index) => (
          <button
            key={group.creatorId}
            onClick={() => openViewer(index)}
            className="flex flex-shrink-0 flex-col items-center gap-2"
          >
            <div className="relative h-16 w-16 rounded-full bg-gradient-to-tr from-slate-700 to-slate-600 p-[2px]">
              <div className="h-full w-full overflow-hidden rounded-full bg-slate-900">
                {group.creatorAvatar ? (
                  <img src={group.creatorAvatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center font-bold text-white">
                    {group.creatorName[0]}
                  </div>
                )}
              </div>
              {group.items.some((item) => !item.hasViewed) && (
                <div className="absolute inset-0 rounded-full ring-2 ring-emerald-500 ring-offset-2 ring-offset-slate-950" />
              )}
            </div>
            <span className="w-16 truncate text-xs text-slate-300">{group.creatorName}</span>
          </button>
        ))}
      </div>

      {viewerOpen && (
        <StoryViewer
          groups={orderedGroups}
          initialGroupIndex={viewerGroupIndex}
          onClose={() => setViewerOpen(false)}
        />
      )}
    </div>
  );
}
