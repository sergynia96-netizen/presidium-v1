// ─── Message Router ────────────────────────────────
// Routes encrypted envelopes between peers. Server NEVER decrypts.

import { sessionManager } from './session-manager';
import type { RelayEnvelope } from '../types';
import { isCommunicationBlocked } from '../relay/contacts-service';
import { prisma } from '../prisma';
import {
  cleanupExpiredQueuedRedis,
  deliverQueuedRedis,
  enqueueOfflineEnvelopeRedis,
  getOfflineQueueStatsRedis,
} from './distributed-state';

interface RouteResult {
  success: boolean;
  error?: string;
  delivered?: boolean;
  storedOffline?: boolean;
  queueSize?: number;
  queuedMessageId?: string;
}

interface QueuedEnvelope {
  id: string;
  envelope: RelayEnvelope;
  queuedAt: number;
  expiresAt: number;
  deliveryAttempts: number;
}

class MessageRouter {
  private readonly perRecipientLimit = Number(process.env.RELAY_QUEUE_PER_RECIPIENT_LIMIT || 500);
  private readonly totalLimit = Number(process.env.RELAY_QUEUE_TOTAL_LIMIT || 5000);
  private readonly ttlMs = Number(process.env.RELAY_QUEUE_TTL_MS || 24 * 60 * 60 * 1000);

  private async blocked(from: string, to: string): Promise<boolean> {
    return isCommunicationBlocked(from, to);
  }

  private async enqueuePrisma(envelope: RelayEnvelope): Promise<{
    ok: boolean;
    queueSize: number;
    queuedMessageId?: string;
    error?: string;
  }> {
    const recipient = envelope.to;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs);

    // Check recipient limit
    const queueSize = await prisma.offlineMessage.count({ where: { toId: recipient } });
    if (queueSize >= this.perRecipientLimit) {
      return { ok: false, queueSize, error: 'Recipient offline queue is full' };
    }

    // Check global limit
    const total = await prisma.offlineMessage.count();
    if (total >= this.totalLimit) {
      return { ok: false, queueSize, error: 'Global offline queue is full' };
    }

    const item = await prisma.offlineMessage.create({
      data: {
        fromId: envelope.from,
        toId: envelope.to,
        envelope: JSON.stringify(envelope),
        queuedAt: now,
        expiresAt,
      },
    });

    return {
      ok: true,
      queueSize: queueSize + 1,
      queuedMessageId: item.id,
    };
  }

  private async enqueue(envelope: RelayEnvelope): Promise<{
    ok: boolean;
    queueSize: number;
    queuedMessageId?: string;
    error?: string;
  }> {
    const distributed = await enqueueOfflineEnvelopeRedis(envelope, {
      perRecipientLimit: this.perRecipientLimit,
      totalLimit: this.totalLimit,
      ttlMs: this.ttlMs,
    });
    if (distributed.supported) {
      return {
        ok: distributed.ok,
        queueSize: distributed.queueSize,
        queuedMessageId: distributed.queuedMessageId,
        error: distributed.error,
      };
    }

    return this.enqueuePrisma(envelope);
  }

  // Deliver encrypted envelope to recipient
  async route(envelope: RelayEnvelope): Promise<RouteResult> {
    const { to, from } = envelope;

    if (!to || !from) {
      return { success: false, error: 'Missing sender or recipient' };
    }

    if (await this.blocked(from, to)) {
      return { success: false, error: 'Communication blocked by user settings' };
    }

    // Try direct delivery via WebSocket
    const delivered = sessionManager.sendTo(to, {
      type: 'relay.envelope',
      payload: envelope,
      timestamp: Date.now(),
    });

    if (delivered) {
      return { success: true, delivered: true };
    }

    // Recipient offline — queue encrypted envelope for deferred delivery.
    const queued = await this.enqueue(envelope);
    if (!queued.ok) {
      return {
        success: false,
        delivered: false,
        storedOffline: false,
        queueSize: queued.queueSize,
        error: queued.error || 'Failed to queue offline message',
      };
    }

    return {
      success: true,
      delivered: false,
      storedOffline: true,
      queueSize: queued.queueSize,
      queuedMessageId: queued.queuedMessageId,
    };
  }

  // Send typing indicator
  async sendTyping(from: string, to: string, isTyping: boolean): Promise<boolean> {
    if (await this.blocked(from, to)) {
      return false;
    }

    return sessionManager.sendTo(to, {
      type: isTyping ? 'typing.start' : 'typing.stop',
      payload: { from },
      timestamp: Date.now(),
    });
  }

  // Send call signal (WebRTC)
  async routeCallSignal(from: string, to: string, signalType: string, payload: Record<string, unknown>): Promise<boolean> {
    if (await this.blocked(from, to)) {
      return false;
    }

    return sessionManager.sendTo(to, {
      type: signalType,
      payload: { ...payload, from },
      timestamp: Date.now(),
    });
  }

  // Deliver queued encrypted envelopes for a user after reconnect/auth.
  private async deliverQueuedPrisma(accountId: string): Promise<{ delivered: number; dropped: number; remaining: number }> {
    // Delete globally expired messages first
    const cleanup = await cleanupExpiredQueuedRedis();
    if (!cleanup.supported) {
      await this.cleanupExpiredQueuesPrisma();
    }

    const queue = await prisma.offlineMessage.findMany({
      where: { toId: accountId },
      orderBy: { queuedAt: 'asc' },
    });

    if (queue.length === 0) {
      return { delivered: 0, dropped: 0, remaining: 0 };
    }

    let deliveredCount = 0;
    let droppedCount = 0;
    const deliveredIds: string[] = [];
    const pendingIds: string[] = [];

    for (const item of queue) {
      if (await this.blocked(item.fromId, item.toId)) {
        droppedCount += 1;
        deliveredIds.push(item.id); // Drop by deleting
        continue;
      }

      let parsedEnvelope: RelayEnvelope | null = null;
      try {
        parsedEnvelope = JSON.parse(item.envelope);
      } catch {
        droppedCount += 1;
        deliveredIds.push(item.id); // Malformed, delete
        continue;
      }

      const sent = sessionManager.sendTo(accountId, {
        type: 'relay.envelope',
        payload: parsedEnvelope,
        timestamp: Date.now(),
        meta: {
          offlineQueued: true,
          queuedAt: item.queuedAt.getTime(),
          queueId: item.id,
        },
      });

      if (!sent) {
        pendingIds.push(item.id);
        // Increment delivery attempts
        await prisma.offlineMessage.update({
          where: { id: item.id },
          data: { deliveryAttempts: { increment: 1 } },
        });
        continue;
      }

      deliveredCount += 1;
      deliveredIds.push(item.id);
    }

    // Delete successfully delivered or intentionally dropped messages
    if (deliveredIds.length > 0) {
      await prisma.offlineMessage.deleteMany({
        where: { id: { in: deliveredIds } },
      });
    }

    return {
      delivered: deliveredCount,
      dropped: droppedCount,
      remaining: pendingIds.length,
    };
  }

  async deliverQueued(accountId: string): Promise<{ delivered: number; dropped: number; remaining: number }> {
    const distributed = await deliverQueuedRedis(
      accountId,
      (item) =>
        sessionManager.sendTo(accountId, {
          type: 'relay.envelope',
          payload: item.envelope,
          timestamp: Date.now(),
          meta: {
            offlineQueued: true,
            queuedAt: item.queuedAt,
            queueId: item.id,
          },
        }),
      (from, to) => this.blocked(from, to),
    );

    const prismaDelivery = await this.deliverQueuedPrisma(accountId);

    return {
      delivered: distributed.delivered + prismaDelivery.delivered,
      dropped: distributed.dropped + prismaDelivery.dropped,
      remaining: distributed.remaining + prismaDelivery.remaining,
    };
  }

  private async cleanupExpiredQueuesPrisma(): Promise<number> {
    const result = await prisma.offlineMessage.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    return result.count;
  }

  // Cleanup expired queued envelopes across all recipients.
  async cleanupExpiredQueues(): Promise<number> {
    const redisCleanup = await cleanupExpiredQueuedRedis();
    const prismaCleanup = await this.cleanupExpiredQueuesPrisma();
    return redisCleanup.removed + prismaCleanup;
  }

  async getOfflineQueueStats(): Promise<{
    recipients: number;
    total: number;
    perRecipientLimit: number;
    totalLimit: number;
    ttlMs: number;
    backend: 'redis' | 'database' | 'hybrid';
  }> {
    const redisStats = await getOfflineQueueStatsRedis();
    const prismaTotal = await prisma.offlineMessage.count();
    const prismaRecipients = await prisma.offlineMessage.groupBy({
      by: ['toId'],
    });
    const useRedis = redisStats.supported;
    const hasPrismaBacklog = prismaTotal > 0;

    return {
      recipients: (useRedis ? redisStats.recipients : 0) + prismaRecipients.length,
      total: (useRedis ? redisStats.total : 0) + prismaTotal,
      perRecipientLimit: this.perRecipientLimit,
      totalLimit: this.totalLimit,
      ttlMs: this.ttlMs,
      backend: useRedis ? (hasPrismaBacklog ? 'hybrid' : 'redis') : 'database',
    };
  }
}

export const messageRouter = new MessageRouter();
