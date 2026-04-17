'use client';

/*
 * CHANGELOG (Codex)
 * 2026-04-17:
 * - Removed periodic 5s polling for outbox state refresh.
 * - Switched to event-driven updates via OUTBOX_UPDATED_EVENT.
 * - Added optional realtime message status tracking from WS ack events
 *   (for provided messageIds) to reduce delayed UI state updates.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  getOutboxSize,
  getOutboxStats,
  OUTBOX_UPDATED_EVENT,
  type OutboxStats,
  type OutboxUpdatedDetail,
} from '@/lib/message-outbox';
import { useWebSocket } from './use-websocket';

type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export function useOutboxStatus(messageIds: string[] = []) {
  const [size, setSize] = useState<number>(() => getOutboxSize());
  const [stats, setStats] = useState<OutboxStats>(() => getOutboxStats());
  const [statuses, setStatuses] = useState<Record<string, MessageStatus>>({});
  const { on, isConnected } = useWebSocket();

  const trackedMessageIds = useMemo(
    () => new Set(messageIds.filter((id) => typeof id === 'string' && id.length > 0)),
    [messageIds.join(',')],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onUpdated = (event: Event) => {
      const custom = event as CustomEvent<Partial<OutboxUpdatedDetail>>;
      if (typeof custom.detail?.size === 'number') {
        setSize(custom.detail.size);
      } else {
        setSize(getOutboxSize());
      }
      if (custom.detail?.stats) {
        setStats(custom.detail.stats);
      } else {
        setStats(getOutboxStats());
      }
    };

    window.addEventListener(OUTBOX_UPDATED_EVENT, onUpdated as EventListener);

    return () => {
      window.removeEventListener(OUTBOX_UPDATED_EVENT, onUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!isConnected || trackedMessageIds.size === 0) return;

    const unsubscribe = on('relay.ack', (payload) => {
      if (!payload || typeof payload !== 'object') return;
      const record = payload as Record<string, unknown>;
      const messageId = typeof record.messageId === 'string' ? record.messageId : '';
      if (!messageId || !trackedMessageIds.has(messageId)) return;

      const deliveredValue = record.delivered;
      const delivered =
        typeof deliveredValue === 'number' ? deliveredValue > 0 : Boolean(deliveredValue);
      const nextStatus: MessageStatus = delivered ? 'delivered' : 'sent';

      setStatuses((prev) => ({ ...prev, [messageId]: nextStatus }));
    });

    return () => {
      unsubscribe();
    };
  }, [isConnected, on, trackedMessageIds]);

  return {
    outboxSize: size,
    hasPendingOutbox: size > 0,
    outboxStats: stats,
    statuses,
  };
}

export default useOutboxStatus;
