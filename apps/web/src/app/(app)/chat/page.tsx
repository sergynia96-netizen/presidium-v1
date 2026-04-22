'use client';

import { useEffect } from 'react';

import { useWebSocket } from '@presidium/shared-ui';

import { StoryBar } from '@/components/stories/StoryBar';

export default function ChatPage() {
  const { connect, status } = useWebSocket();

  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-white">
      <div className="flex h-14 items-center justify-between border-b border-slate-800 px-4">
        <h1 className="text-lg font-bold">Messages</h1>
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${
              status === 'connected' ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-sm capitalize text-slate-400">{status}</span>
        </div>
      </div>

      <StoryBar />

      <div className="flex flex-1">
        <div className="w-80 border-r border-slate-800 p-4">
          <p className="text-sm text-slate-600">Select a conversation</p>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-slate-600">No chat selected</p>
        </div>
      </div>
    </div>
  );
}
