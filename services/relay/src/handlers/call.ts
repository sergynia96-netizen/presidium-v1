/**
 * @author [Ваше Полное Имя]
 * @copyright (C) 2026 [Ваше Полное Имя]. All Rights Reserved.
 *
 * WebRTC Signaling Handler — Production Version
 *
 * Presidium does NOT proxy media. Only signaling:
 * - offer/answer (SDP negotiation)
 * - ice-candidate (NAT traversal)
 * - hangup (call termination)
 */

import type { Redis } from 'ioredis';

import type { ExtendedWebSocket } from '../ws/handler.js';

interface CallState {
  callId: string;
  callerId: string;
  calleeId: string;
  callType: 'audio' | 'video';
  startedAt: number;
  status: 'ringing' | 'connected' | 'ended';
}

const activeCalls = new Map<string, CallState>();
const MAX_CALL_DURATION_MS = 14_400_000;

setInterval(() => {
  const now = Date.now();
  for (const [callId, call] of activeCalls) {
    if (call.status === 'ended' || now - call.startedAt > MAX_CALL_DURATION_MS) {
      activeCalls.delete(callId);
    }
  }
}, 60_000);

export async function handleCallSignal(
  payload: {
    type: 'offer' | 'answer' | 'ice-candidate' | 'hangup';
    callId: string;
    toUserId: string;
    payload: unknown;
    callType?: 'audio' | 'video';
  },
  ws: ExtendedWebSocket,
  redis: Redis
): Promise<void> {
  const fromUserId = ws.userId!;

  if (!payload.callId || !payload.toUserId) {
    ws.send(
      JSON.stringify({
        type: 'call.error',
        payload: { error: 'Missing callId or toUserId', code: 'VALIDATION_ERROR' },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  if (payload.type === 'offer') {
    activeCalls.set(payload.callId, {
      callId: payload.callId,
      callerId: fromUserId,
      calleeId: payload.toUserId,
      callType: payload.callType || 'audio',
      startedAt: Date.now(),
      status: 'ringing',
    });
  } else if (payload.type === 'answer') {
    const call = activeCalls.get(payload.callId);
    if (call) {
      call.status = 'connected';
    }
  } else if (payload.type === 'hangup') {
    const call = activeCalls.get(payload.callId);
    if (call) {
      call.status = 'ended';
    }
  }

  const forwardMsg = JSON.stringify({
    type: 'call.signal',
    payload: {
      type: payload.type,
      callId: payload.callId,
      fromUserId,
      callType: payload.callType,
      payload: payload.payload,
    },
    timestamp: Date.now(),
  });

  try {
    await redis.publish(`user:${payload.toUserId}`, forwardMsg);
  } catch (err) {
    console.error('[Call] Failed to forward signal:', err);
    ws.send(
      JSON.stringify({
        type: 'call.error',
        payload: { error: 'Failed to reach recipient', code: 'DELIVERY_ERROR' },
        timestamp: Date.now(),
      }),
      false
    );
    return;
  }

  ws.send(
    JSON.stringify({
      type: 'call.ack',
      payload: {
        callId: payload.callId,
        type: payload.type,
        status: 'forwarded',
        callState: activeCalls.get(payload.callId)?.status,
      },
      timestamp: Date.now(),
    }),
    false
  );
}

export function getCallInfo(callId: string): CallState | undefined {
  return activeCalls.get(callId);
}

export function getCallStats(): {
  totalActive: number;
  ringing: number;
  connected: number;
  ended: number;
} {
  let ringing = 0;
  let connected = 0;
  let ended = 0;

  for (const call of activeCalls.values()) {
    if (call.status === 'ringing') {
      ringing += 1;
    } else if (call.status === 'connected') {
      connected += 1;
    } else {
      ended += 1;
    }
  }

  return {
    totalActive: activeCalls.size,
    ringing,
    connected,
    ended,
  };
}

export async function endUserCalls(userId: string, redis: Redis): Promise<void> {
  for (const [callId, call] of activeCalls) {
    if (call.callerId === userId || call.calleeId === userId) {
      call.status = 'ended';
      const otherId = call.callerId === userId ? call.calleeId : call.callerId;
      await redis.publish(
        `user:${otherId}`,
        JSON.stringify({
          type: 'call.signal',
          payload: {
            type: 'hangup',
            callId,
            fromUserId: userId,
            reason: 'peer_disconnected',
          },
          timestamp: Date.now(),
        })
      );
    }
  }
}
