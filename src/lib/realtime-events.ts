export const RELAY_QUEUE_DELIVERED_EVENT = 'presidium:relay-queue-delivered';

export interface RelayQueueDeliveredDetail {
  delivered: number;
  dropped: number;
  remaining: number;
}

function toFiniteCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return 0;
}

export function parseRelayQueueDeliveredPayload(payload: unknown): RelayQueueDeliveredDetail {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  return {
    delivered: toFiniteCount(record.delivered),
    dropped: toFiniteCount(record.dropped),
    remaining: toFiniteCount(record.remaining),
  };
}

export function shouldShowRelayQueueDeliveredBanner(detail: RelayQueueDeliveredDetail | null): boolean {
  return Boolean(detail && detail.delivered > 0);
}
