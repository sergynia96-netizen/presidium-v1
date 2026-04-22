'use client';

import { useState } from 'react';

import { FeedList } from '@/components/feed/FeedList';
import { PostComposer } from '@/components/feed/PostComposer';
import { TopicFilter } from '@/components/feed/TopicFilter';

export default function FeedPage() {
  const [topic, setTopic] = useState('');

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Feed</h1>
        </div>

        <TopicFilter active={topic} onChange={setTopic} />

        <div className="mt-6">
          <PostComposer />
          <FeedList topic={topic || undefined} />
        </div>
      </div>
    </div>
  );
}
