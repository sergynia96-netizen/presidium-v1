'use client';

import { ThumbsDown, ThumbsUp } from 'lucide-react';

import { useReactToPost } from '@/hooks/useFeed';

interface Props {
  postId: string;
  likes: number;
  dislikes: number;
  isLiked: boolean;
  isDisliked: boolean;
}

export function ReactionBar({
  postId,
  likes,
  dislikes,
  isLiked,
  isDisliked,
}: Props) {
  const mutation = useReactToPost();

  const handleLike = () => mutation.mutate({ postId, type: isLiked ? 'none' : 'like' });
  const handleDislike = () =>
    mutation.mutate({ postId, type: isDisliked ? 'none' : 'dislike' });

  return (
    <div className="mt-3 flex items-center gap-4">
      <button
        onClick={handleLike}
        disabled={mutation.isPending}
        className={`flex items-center gap-1.5 text-sm transition-colors ${
          isLiked ? 'text-indigo-400' : 'text-slate-400 hover:text-indigo-400'
        }`}
      >
        <ThumbsUp className={`h-4 w-4 ${isLiked ? 'fill-indigo-400' : ''}`} />
        <span>{likes}</span>
      </button>

      <button
        onClick={handleDislike}
        disabled={mutation.isPending}
        className={`flex items-center gap-1.5 text-sm transition-colors ${
          isDisliked ? 'text-red-400' : 'text-slate-400 hover:text-red-400'
        }`}
      >
        <ThumbsDown className={`h-4 w-4 ${isDisliked ? 'fill-red-400' : ''}`} />
        <span>{dislikes}</span>
      </button>
    </div>
  );
}
