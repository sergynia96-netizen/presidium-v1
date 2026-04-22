'use client';

import { useState } from 'react';
import { Link, Repeat, Share2, X } from 'lucide-react';

import { useRepost } from '@/hooks/useFeed';

interface Props {
  postId: string;
  onClose: () => void;
}

export function ShareModal({ postId, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const repostMutation = useRepost();

  const copyLink = async () => {
    await navigator.clipboard.writeText(`https://presidium.app/feed/${postId}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const nativeShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: 'Presidium Post',
        url: `https://presidium.app/feed/${postId}`,
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-white">Share</h3>
          <button onClick={onClose}>
            <X className="h-5 w-5 text-slate-400 hover:text-white" />
          </button>
        </div>

        <div className="space-y-2">
          <button
            onClick={() => repostMutation.mutate(postId)}
            disabled={repostMutation.isPending}
            className="flex w-full items-center gap-3 rounded-lg bg-slate-800 p-3 text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            <Repeat className="h-5 w-5 text-indigo-400" />
            <span>Repost to Feed</span>
          </button>

          <button
            onClick={() => {
              copyLink().catch((err) => console.error('[Feed] Copy link failed:', err));
            }}
            className="flex w-full items-center gap-3 rounded-lg bg-slate-800 p-3 text-white transition-colors hover:bg-slate-700"
          >
            <Link className="h-5 w-5 text-indigo-400" />
            <span>{copied ? 'Copied!' : 'Copy Link'}</span>
          </button>

          <button
            onClick={() => {
              nativeShare().catch((err) => console.error('[Feed] Native share failed:', err));
            }}
            className="flex w-full items-center gap-3 rounded-lg bg-slate-800 p-3 text-white transition-colors hover:bg-slate-700"
          >
            <Share2 className="h-5 w-5 text-indigo-400" />
            <span>Share via...</span>
          </button>
        </div>
      </div>
    </div>
  );
}
