'use client';

/*
 * CHANGELOG (Codex)
 * 2026-04-17:
 * - Added central realtime listener component.
 * - Subscribes to relay ack/typing events and forwards updates into Zustand store.
 * - Keeps realtime subscriptions tied to authenticated session state.
 */

import { useEffect } from 'react';
import { useWebSocket } from '@/hooks/use-websocket';
import { useAppStore } from '@/store/use-app-store';
import { resolveAckStatusUpdate } from '@/lib/realtime-inbound';
import { useSession } from 'next-auth/react';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

export function RealtimeListener() {
  const { status } = useSession();
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);
  const setMessageStatus = useAppStore((state) => state.setMessageStatus);
  const setChatTypingUser = useAppStore((state) => state.setChatTypingUser);
  const chats = useAppStore((state) => state.chats);

  const { on, isConnected } = useWebSocket({
    enabled: isAuthenticated && status === 'authenticated',
  });

  useEffect(() => {
    if (!isAuthenticated || status !== 'authenticated' || !isConnected) return;

    const unsubs: Array<() => void> = [];

    const registerAck = (eventName: 'relay.ack' | 'relay.group_ack' | 'relay.channel_ack') => {
      unsubs.push(
        on(eventName, (payload) => {
          const update = resolveAckStatusUpdate(payload);
          if (!update) return;
          setMessageStatus(update.chatId, update.messageId, update.nextStatus);
        }),
      );
    };

    registerAck('relay.ack');
    registerAck('relay.group_ack');
    registerAck('relay.channel_ack');

    unsubs.push(
      on('typing.start', (payload) => {
        const record = asRecord(payload);
        const from = typeof record.from === 'string' ? record.from : '';
        if (!from) return;
        const chat = chats.find((entry) => Array.isArray(entry.members) && entry.members.includes(from));
        if (!chat) return;
        setChatTypingUser(chat.id, from, true);
      }),
    );

    unsubs.push(
      on('typing.stop', (payload) => {
        const record = asRecord(payload);
        const from = typeof record.from === 'string' ? record.from : '';
        if (!from) return;
        const chat = chats.find((entry) => Array.isArray(entry.members) && entry.members.includes(from));
        if (!chat) return;
        setChatTypingUser(chat.id, from, false);
      }),
    );

    return () => {
      for (const unsubscribe of unsubs) {
        unsubscribe();
      }
    };
  }, [chats, isAuthenticated, isConnected, on, setChatTypingUser, setMessageStatus, status]);

  return null;
}
