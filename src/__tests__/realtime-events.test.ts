import { describe, expect, it } from 'vitest';
import {
  parseRelayQueueDeliveredPayload,
  shouldShowRelayQueueDeliveredBanner,
} from '@/lib/realtime-events';

describe('realtime queue delivered payload parser', () => {
  it('parses numeric payload safely', () => {
    const detail = parseRelayQueueDeliveredPayload({ delivered: 3, dropped: 1, remaining: 2 });

    expect(detail).toEqual({ delivered: 3, dropped: 1, remaining: 2 });
    expect(shouldShowRelayQueueDeliveredBanner(detail)).toBe(true);
  });

  it('parses numeric string payload and floors decimals', () => {
    const detail = parseRelayQueueDeliveredPayload({ delivered: '4.8', dropped: '0', remaining: '1.2' });

    expect(detail).toEqual({ delivered: 4, dropped: 0, remaining: 1 });
    expect(shouldShowRelayQueueDeliveredBanner(detail)).toBe(true);
  });

  it('sanitizes invalid or negative values to zero', () => {
    const detail = parseRelayQueueDeliveredPayload({ delivered: -10, dropped: 'bad', remaining: null });

    expect(detail).toEqual({ delivered: 0, dropped: 0, remaining: 0 });
    expect(shouldShowRelayQueueDeliveredBanner(detail)).toBe(false);
  });

  it('handles non-object payload', () => {
    const detail = parseRelayQueueDeliveredPayload(undefined);

    expect(detail).toEqual({ delivered: 0, dropped: 0, remaining: 0 });
    expect(shouldShowRelayQueueDeliveredBanner(detail)).toBe(false);
  });
});
