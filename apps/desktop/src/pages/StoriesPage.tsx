/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
import React, { useState } from "react";
import { Plus, X, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import Avatar from "../components/Avatar";

interface Story {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  viewed: boolean;
  items: { id: string; type: string; content: string; createdAt: number }[];
}

const mockStories: Story[] = [
  { id: "1", authorId: "u1", authorName: "Alice", authorAvatar: null, viewed: false, items: [{ id: "s1", type: "image", content: "https://placehold.co/400x700/1a1a2e/16213e?text=Story+1", createdAt: Date.now() - 3600000 }] },
  { id: "2", authorId: "u2", authorName: "Bob", authorAvatar: null, viewed: false, items: [{ id: "s2", type: "text", content: "Building something cool! 🔥", createdAt: Date.now() - 7200000 }] },
  { id: "3", authorId: "u3", authorName: "Charlie", authorAvatar: null, viewed: true, items: [{ id: "s3", type: "text", content: "Good morning world ☀️", createdAt: Date.now() - 86400000 }] },
];

export default function StoriesPage() {
  const [stories] = useState<Story[]>(mockStories);
  const [viewing, setViewing] = useState<{ storyIdx: number; itemIdx: number } | null>(null);

  const currentStory = viewing ? stories[viewing.storyIdx] : null;
  const currentItem = currentStory?.items[viewing!.itemIdx];

  const closeViewer = () => setViewing(null);
  const goNext = () => {
    if (!viewing) return;
    const story = stories[viewing.storyIdx];
    if (viewing.itemIdx < story.items.length - 1) {
      setViewing({ ...viewing, itemIdx: viewing.itemIdx + 1 });
    } else if (viewing.storyIdx < stories.length - 1) {
      setViewing({ storyIdx: viewing.storyIdx + 1, itemIdx: 0 });
    } else { closeViewer(); }
  };
  const goPrev = () => {
    if (!viewing) return;
    if (viewing.itemIdx > 0) setViewing({ ...viewing, itemIdx: viewing.itemIdx - 1 });
    else if (viewing.storyIdx > 0) {
      const prev = stories[viewing.storyIdx - 1];
      setViewing({ storyIdx: viewing.storyIdx - 1, itemIdx: prev.items.length - 1 });
    }
  };

  return (
    <div className="flex-1 bg-slate-950 overflow-y-auto">
      {/* Story bar */}
      <div className="border-b border-slate-800 bg-slate-900 p-4">
        <div className="flex gap-4 overflow-x-auto pb-2">
          <button className="flex flex-col items-center gap-1 shrink-0">
            <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-dashed border-slate-600 flex items-center justify-center">
              <Plus size={24} className="text-slate-400" />
            </div>
            <span className="text-xs text-slate-500">Add Story</span>
          </button>
          {stories.map((s, idx) => (
            <button key={s.id} onClick={() => setViewing({ storyIdx: idx, itemIdx: 0 })}
              className="flex flex-col items-center gap-1 shrink-0">
              <div className={p-0.5 rounded-full }>
                <Avatar name={s.authorName} src={s.authorAvatar} size="lg" />
              </div>
              <span className="text-xs text-slate-400 truncate w-16 text-center">{s.authorName}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Viewer */}
      {viewing && currentItem && (
        <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
          <button onClick={closeViewer} className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-full z-10"><X size={24} /></button>
          <button onClick={goPrev} className="absolute left-4 p-2 text-white hover:bg-white/10 rounded-full"><ChevronLeft size={28} /></button>
          <button onClick={goNext} className="absolute right-4 p-2 text-white hover:bg-white/10 rounded-full"><ChevronRight size={28} /></button>
          {currentItem.type === "image" ? (
            <img src={currentItem.content} alt="story" className="max-h-[90vh] rounded-xl" />
          ) : (
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-12 max-w-lg text-center">
              <p className="text-2xl text-white">{currentItem.content}</p>
            </div>
          )}
          <div className="absolute top-4 left-4 flex items-center gap-2">
            <Avatar name={currentStory!.authorName} size="sm" />
            <span className="text-sm text-white font-medium">{currentStory!.authorName}</span>
            <span className="text-xs text-slate-400">{new Date(currentItem.createdAt).toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      <div className="p-6">
        <h2 className="text-lg font-bold text-white mb-4">Recent Stories</h2>
        {stories.filter(s => !s.viewed).length === 0 && (
          <p className="text-slate-500 text-sm">No new stories</p>
        )}
      </div>
    </div>
  );
}
