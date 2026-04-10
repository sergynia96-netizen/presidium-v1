import { describe, expect, it } from 'vitest';
import {
  buildOutboxMessageIndicators,
  type OutboxTask,
} from '@/lib/message-outbox';

function makeTask(overrides: Partial<OutboxTask> = {}): OutboxTask {
  const now = Date.now();
  return {
    id: overrides.id || crypto.randomUUID(),
    kind: overrides.kind || 'api_persist',
    chatId: overrides.chatId || 'chat-1',
    messageId: overrides.messageId || 'msg-1',
    payload: overrides.payload || {},
    signature: overrides.signature || `sig-${Math.random()}`,
    createdAt: overrides.createdAt ?? now,
    attempts: overrides.attempts ?? 0,
    nextAttemptAt: overrides.nextAttemptAt ?? now,
  };
}

describe('outbox message indicators', () => {
  it('marks fresh message task as queued', () => {
    const tasks: OutboxTask[] = [
      makeTask({
        kind: 'api_persist',
        chatId: 'chat-1',
        messageId: 'm-queued',
      }),
    ];

    const indicators = buildOutboxMessageIndicators(tasks, 'chat-1');
    expect(indicators['m-queued']).toEqual({
      state: 'queued',
      attempts: 0,
      nextAttemptAt: tasks[0].nextAttemptAt,
      categories: ['send'],
    });
  });

  it('marks retried task as retrying and keeps max attempts', () => {
    const tasks: OutboxTask[] = [
      makeTask({
        kind: 'api_request',
        chatId: 'chat-1',
        messageId: 'm-retry',
        attempts: 1,
        payload: {
          method: 'PATCH',
          path: '/api/messages/m-retry',
          body: { status: 'read' },
        },
      }),
      makeTask({
        kind: 'ws_broadcast',
        chatId: 'chat-1',
        messageId: 'm-retry',
        attempts: 3,
        payload: {
          event: 'edit',
        },
      }),
    ];

    const indicators = buildOutboxMessageIndicators(tasks, 'chat-1');
    expect(indicators['m-retry'].state).toBe('retrying');
    expect(indicators['m-retry'].attempts).toBe(3);
    expect(indicators['m-retry'].categories.sort()).toEqual(['edit', 'status']);
  });

  it('filters out tasks from other chats', () => {
    const tasks: OutboxTask[] = [
      makeTask({ chatId: 'chat-1', messageId: 'm1' }),
      makeTask({ chatId: 'chat-2', messageId: 'm2' }),
    ];

    const indicators = buildOutboxMessageIndicators(tasks, 'chat-1');
    expect(Object.keys(indicators)).toEqual(['m1']);
  });

  it('returns empty map for chat with no pending tasks', () => {
    const tasks: OutboxTask[] = [makeTask({ chatId: 'chat-2' })];
    const indicators = buildOutboxMessageIndicators(tasks, 'chat-1');
    expect(indicators).toEqual({});
  });
});
