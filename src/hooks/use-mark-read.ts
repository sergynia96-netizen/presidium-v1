'use client';

import { useEffect, useRef } from 'react';

/**
 * Hook to automatically mark messages as read when a chat is opened.
 * Uses debounced API call to avoid excessive requests.
 */
export function useMarkAsRead(chatId: string | null, enabled: boolean = true) {
  const chatIdRef = useRef(chatId);

  useEffect(() => {
    chatIdRef.current = chatId;
  }, [chatId]);

  useEffect(() => {
    if (!chatId || !enabled) return;

    // Debounce to avoid rapid API calls during navigation
    const timer = setTimeout(async () => {
      if (chatIdRef.current !== chatId) return;

      try {
        await fetch('/api/messages/mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId }),
        });
      } catch {
        // Silently fail — non-critical
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [chatId, enabled]);
}
