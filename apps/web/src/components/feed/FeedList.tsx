'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';

import { useFeedPosts } from '@/hooks/useFeed';
import { PostCard } from './PostCard';

interface Props {
  topic?: string;
}

export function FeedList({ topic }: Props) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useFeedPosts(topic);

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const posts = data?.pages.flatMap((page) => page.posts) ?? [];

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [target] = entries;
      if (target.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage().catch((err) => console.error('[Feed] Pagination failed:', err));
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  );

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element) {
      return;
    }

    observerRef.current = new IntersectionObserver(handleObserver, {
      rootMargin: '200px',
    });
    observerRef.current.observe(element);

    return () => observerRef.current?.disconnect();
  }, [handleObserver]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, index) => (
          <div
            key={index}
            className="animate-pulse rounded-xl border border-slate-800 bg-slate-900 p-4"
          >
            <div className="mb-3 h-4 w-1/3 rounded bg-slate-800" />
            <div className="mb-2 h-3 w-3/4 rounded bg-slate-800" />
            <div className="h-3 w-1/2 rounded bg-slate-800" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4 text-slate-400">Failed to load feed</p>
        <button
          onClick={() => refetch()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-500"
        >
          Retry
        </button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-500">No posts yet. Be the first to share something!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}

      <div ref={loadMoreRef} className="flex h-8 items-center justify-center">
        {isFetchingNextPage && <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />}
        {!hasNextPage && posts.length > 0 && (
          <span className="text-xs text-slate-600">You've reached the end</span>
        )}
      </div>
    </div>
  );
}
