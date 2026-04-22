/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { StoryCreator } from '@/components/stories/StoryCreator';
import { type StoryGroup, StoryViewer } from '@/components/stories/StoryViewer';
import { useAuth } from '@/hooks/useAuth';
import { type Story, useStories } from '@/hooks/useStories';

export default function StoriesPage() {
  const { user } = useAuth();
  const { listStories, loading } = useStories();
  const [stories, setStories] = useState<Story[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerGroupIndex, setViewerGroupIndex] = useState(0);

  const loadStories = useCallback(async () => {
    const data = await listStories();
    setStories(data);
  }, [listStories]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadStories().catch((err) => console.error('[StoriesPage] Load failed:', err));
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadStories]);

  const groups = useMemo(() => {
    const map = new Map<string, StoryGroup>();
    stories.forEach((story) => {
      const current = map.get(story.creatorId);
      if (current) {
        current.items.push(story);
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

  const myStories = groups.find((group) => group.creatorId === user?.id);
  const otherGroups = groups.filter((group) => group.creatorId !== user?.id);
  const orderedGroups = myStories ? [myStories, ...otherGroups] : groups;

  const openViewer = (groupIndex: number) => {
    setViewerGroupIndex(groupIndex);
    setViewerOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-2xl p-4">
        <h1 className="mb-6 text-2xl font-bold">Stories</h1>

        <StoryCreator onCreated={loadStories} />

        {myStories && (
          <div className="mb-6">
            <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">Your Story</h2>
            <button
              onClick={() => openViewer(0)}
              className="relative h-20 w-20 rounded-full bg-gradient-to-tr from-emerald-500 to-cyan-500 p-[3px]"
            >
              <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-slate-900">
                {myStories.creatorAvatar ? (
                  <img src={myStories.creatorAvatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="font-bold text-white">You</span>
                )}
              </div>
              {myStories.items.length > 0 && (
                <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  {myStories.items.length}
                </div>
              )}
            </button>
          </div>
        )}

        <div>
          <h2 className="mb-3 text-sm font-bold uppercase text-slate-500">Recent</h2>
          {loading && <p className="text-slate-500">Loading...</p>}
          <div className="flex gap-4 overflow-x-auto pb-4">
            {otherGroups.map((group, idx) => (
              <button
                key={group.creatorId}
                onClick={() => openViewer(idx + (myStories ? 1 : 0))}
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
        </div>
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
