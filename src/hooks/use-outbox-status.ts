'use client';

import { useEffect, useState } from 'react';
import {
  getOutboxSize,
  getOutboxStats,
  OUTBOX_UPDATED_EVENT,
  type OutboxStats,
  type OutboxUpdatedDetail,
} from '@/lib/message-outbox';

export function useOutboxStatus() {
  const [size, setSize] = useState<number>(() => getOutboxSize());
  const [stats, setStats] = useState<OutboxStats>(() => getOutboxStats());

  useEffect(() => {
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

    const interval = setInterval(() => {
      setSize(getOutboxSize());
      setStats(getOutboxStats());
    }, 5000);

    return () => {
      window.removeEventListener(OUTBOX_UPDATED_EVENT, onUpdated as EventListener);
      clearInterval(interval);
    };
  }, []);

  return {
    outboxSize: size,
    hasPendingOutbox: size > 0,
    outboxStats: stats,
  };
}

export default useOutboxStatus;
