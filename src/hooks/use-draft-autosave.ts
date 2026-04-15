'use client';

import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook for server-side draft autosave.
 * Complements localStorage-based draft with server persistence.
 * Saves draft after a debounce period when content changes.
 */
export function useDraftAutosave(
  chatId: string | null,
  content: string,
  enabled: boolean = true,
) {
  const contentRef = useRef(content);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<string | null>(null);

  useEffect(() => {
    contentRef.current = content;
  }, [content]);

  const saveDraft = useCallback(async (id: string, text: string) => {
    if (lastSavedRef.current === text) return;

    try {
      await fetch(`/api/chats/${id}/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text.trim() ? text : '' }),
      });
      lastSavedRef.current = text;
    } catch {
      // Silently fail — draft is still saved in localStorage
    }
  }, []);

  useEffect(() => {
    if (!chatId || !enabled) return;

    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Save after 5 seconds of inactivity
    saveTimerRef.current = setTimeout(() => {
      saveDraft(chatId, contentRef.current);
    }, 5000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [chatId, content, enabled, saveDraft]);
}
