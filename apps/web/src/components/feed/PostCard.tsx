'use client';

import { useState } from 'react';
import { MoreHorizontal, Repeat } from 'lucide-react';

import type { FeedPost } from '@/hooks/useFeed';
import { CommentSection } from './CommentSection';
import { MediaGallery } from './MediaGallery';
import { ReactionBar } from './ReactionBar';
import { ShareModal } from './ShareModal';

interface Props {
  post: FeedPost;
}

export function PostCard({ post }: Props) {
  const [showShare, setShowShare] = useState(false);
  const timeAgo = getTimeAgo(post.createdAt);

  return (
    <article className="mb-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={post.authorAvatar || '/default-avatar.png'}
            alt={post.authorName}
            className="h-10 w-10 rounded-full bg-slate-800 object-cover"
          />
          <div>
            <h4 className="text-sm font-medium text-white">{post.authorName}</h4>
            <span className="text-xs text-slate-500">{timeAgo}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {post.topic && (
            <span className="rounded-full bg-slate-800 px-2 py-1 text-xs font-medium text-indigo-400">
              {post.topic}
            </span>
          )}
          <button className="p-1 text-slate-500 hover:text-white">
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
      </div>

      <h3 className="mb-2 text-base font-semibold text-white">{post.title}</h3>
      <p className="whitespace-pre-wrap break-words text-sm text-slate-300">{post.content}</p>

      <MediaGallery urls={post.mediaUrls} />

      <ReactionBar
        postId={post.id}
        likes={post.likes}
        dislikes={post.dislikes}
        isLiked={post.isLiked}
        isDisliked={post.isDisliked}
      />

      <div className="mt-2 flex items-center gap-4">
        <CommentSection postId={post.id} commentCount={post.comments} />
        <button
          onClick={() => setShowShare(true)}
          className="flex items-center gap-1.5 text-sm text-slate-400 transition-colors hover:text-indigo-400"
        >
          <Repeat className="h-4 w-4" />
          <span>{post.repostCount}</span>
        </button>
      </div>

      {showShare && <ShareModal postId={post.id} onClose={() => setShowShare(false)} />}
    </article>
  );
}

function getTimeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) {
    return 'just now';
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return new Date(date).toLocaleDateString();
}
