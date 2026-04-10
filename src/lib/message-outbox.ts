'use client';

export type OutboxTaskKind = 'api_persist' | 'api_request' | 'ws_broadcast';
export type OutboxFlushDecision = 'success' | 'retry' | 'drop' | 'defer';
export type OutboxCategory = 'send' | 'edit' | 'delete' | 'status' | 'ai' | 'openclaw' | 'ws' | 'other';

export interface OutboxTask {
  id: string;
  kind: OutboxTaskKind;
  chatId: string;
  messageId: string;
  payload: Record<string, unknown>;
  signature: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
}

interface EnqueueOutboxTaskInput {
  kind: OutboxTaskKind;
  chatId: string;
  messageId: string;
  payload: Record<string, unknown>;
}

export interface OutboxStats {
  total: number;
  byCategory: Record<OutboxCategory, number>;
}

export interface OutboxUpdatedDetail {
  size: number;
  stats: OutboxStats;
}

export interface OutboxMessageIndicator {
  state: 'queued' | 'retrying';
  attempts: number;
  nextAttemptAt: number;
  categories: OutboxCategory[];
}

const OUTBOX_STORAGE_KEY = 'presidium_message_outbox_v1';
export const OUTBOX_UPDATED_EVENT = 'presidium:outbox-updated';
const MAX_OUTBOX_TASKS = 1000;
const MAX_OUTBOX_ATTEMPTS = 20;

let isFlushing = false;

function isBrowser() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function readOutbox(): OutboxTask[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(OUTBOX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutboxTask[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        (item.kind === 'api_persist' || item.kind === 'api_request' || item.kind === 'ws_broadcast') &&
        typeof item.chatId === 'string' &&
        typeof item.messageId === 'string' &&
        item.payload &&
        typeof item.payload === 'object' &&
        typeof item.signature === 'string' &&
        typeof item.createdAt === 'number' &&
        typeof item.attempts === 'number' &&
        typeof item.nextAttemptAt === 'number',
    );
  } catch {
    return [];
  }
}

function createEmptyOutboxStats(): OutboxStats {
  return {
    total: 0,
    byCategory: {
      send: 0,
      edit: 0,
      delete: 0,
      status: 0,
      ai: 0,
      openclaw: 0,
      ws: 0,
      other: 0,
    },
  };
}

function classifyTaskCategory(task: OutboxTask): OutboxCategory {
  if (task.kind === 'api_persist') {
    return 'send';
  }

  if (task.kind === 'ws_broadcast') {
    const event = typeof task.payload.event === 'string' ? task.payload.event : '';
    if (event === 'edit') return 'edit';
    if (event === 'delete') return 'delete';
    return 'ws';
  }

  const methodRaw = task.payload.method;
  const method = typeof methodRaw === 'string' ? methodRaw.toUpperCase() : '';
  const pathRaw = task.payload.path;
  const path = typeof pathRaw === 'string' ? pathRaw : '';

  if (method === 'POST' && path === '/api/ai-in-chat') {
    return 'ai';
  }

  if (method === 'POST' && path === '/api/openclaw/chat') {
    return 'openclaw';
  }

  if (method === 'DELETE' && path.startsWith('/api/messages/')) {
    return 'delete';
  }

  if (method === 'PATCH' && path.startsWith('/api/messages/')) {
    const body = task.payload.body;
    if (body && typeof body === 'object') {
      const bodyRecord = body as Record<string, unknown>;
      if (typeof bodyRecord.status === 'string') return 'status';
      if (typeof bodyRecord.content === 'string') return 'edit';
    }
    return 'other';
  }

  return 'other';
}

function getOutboxStatsFromTasks(tasks: OutboxTask[]): OutboxStats {
  const stats = createEmptyOutboxStats();
  stats.total = tasks.length;

  for (const task of tasks) {
    const category = classifyTaskCategory(task);
    stats.byCategory[category] += 1;
  }

  return stats;
}

function writeOutbox(tasks: OutboxTask[]) {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(tasks));
    const stats = getOutboxStatsFromTasks(tasks);
    window.dispatchEvent(
      new CustomEvent(OUTBOX_UPDATED_EVENT, {
        detail: {
          size: tasks.length,
          stats,
        } satisfies OutboxUpdatedDetail,
      }),
    );
  } catch {
    // Ignore storage write failures.
  }
}

function computeSignature(input: EnqueueOutboxTaskInput): string {
  if (input.kind === 'api_request') {
    const method =
      typeof input.payload.method === 'string' && input.payload.method.trim().length > 0
        ? input.payload.method.toUpperCase()
        : 'PATCH';
    const path =
      typeof input.payload.path === 'string' && input.payload.path.trim().length > 0
        ? input.payload.path
        : `/api/messages/${input.messageId}`;
    const body = input.payload.body ? JSON.stringify(input.payload.body) : '';
    return `${input.kind}:${input.chatId}:${input.messageId}:${method}:${path}:${body}`;
  }

  const event =
    typeof input.payload.event === 'string' && input.payload.event.trim().length > 0
      ? input.payload.event
      : 'message';
  return `${input.kind}:${input.chatId}:${input.messageId}:${event}`;
}

function backoffMs(attempt: number): number {
  const exp = Math.min(Math.max(attempt, 1), 6);
  return Math.min(60000, 2000 * 2 ** (exp - 1));
}

export function buildOutboxMessageIndicators(
  tasks: OutboxTask[],
  chatId: string,
): Record<string, OutboxMessageIndicator> {
  const byMessageId = new Map<string, OutboxTask[]>();

  for (const task of tasks) {
    if (task.chatId !== chatId) continue;
    const existing = byMessageId.get(task.messageId) || [];
    existing.push(task);
    byMessageId.set(task.messageId, existing);
  }

  const result: Record<string, OutboxMessageIndicator> = {};

  for (const [messageId, messageTasks] of byMessageId.entries()) {
    let attempts = 0;
    let nextAttemptAt = Number.MAX_SAFE_INTEGER;
    let hasRetryingTask = false;
    const categories = new Set<OutboxCategory>();

    for (const task of messageTasks) {
      attempts = Math.max(attempts, task.attempts);
      nextAttemptAt = Math.min(nextAttemptAt, task.nextAttemptAt);
      if (task.attempts > 0) {
        hasRetryingTask = true;
      }
      categories.add(classifyTaskCategory(task));
    }

    if (nextAttemptAt === Number.MAX_SAFE_INTEGER) {
      nextAttemptAt = Date.now();
    }

    result[messageId] = {
      state: hasRetryingTask ? 'retrying' : 'queued',
      attempts,
      nextAttemptAt,
      categories: Array.from(categories.values()),
    };
  }

  return result;
}

export function enqueueOutboxTask(input: EnqueueOutboxTaskInput) {
  if (!isBrowser()) return;
  const now = Date.now();
  const tasks = readOutbox();
  const signature = computeSignature(input);

  if (tasks.some((task) => task.signature === signature)) {
    return;
  }

  const nextTasks: OutboxTask[] = [
    ...tasks,
    {
      id: crypto.randomUUID(),
      kind: input.kind,
      chatId: input.chatId,
      messageId: input.messageId,
      payload: input.payload,
      signature,
      createdAt: now,
      attempts: 0,
      nextAttemptAt: now,
    },
  ];

  if (nextTasks.length > MAX_OUTBOX_TASKS) {
    nextTasks.sort((a, b) => a.createdAt - b.createdAt);
    writeOutbox(nextTasks.slice(nextTasks.length - MAX_OUTBOX_TASKS));
    return;
  }

  writeOutbox(nextTasks);
}

export async function flushOutbox(
  processor: (task: OutboxTask) => Promise<OutboxFlushDecision> | OutboxFlushDecision,
) {
  if (!isBrowser() || isFlushing) return;
  isFlushing = true;

  try {
    const now = Date.now();
    const tasks = readOutbox();
    if (tasks.length === 0) return;

    const nextTasks: OutboxTask[] = [];
    let changed = false;

    for (const task of tasks) {
      if (task.nextAttemptAt > now) {
        nextTasks.push(task);
        continue;
      }

      let decision: OutboxFlushDecision = 'retry';
      try {
        decision = await processor(task);
      } catch {
        decision = 'retry';
      }

      if (decision === 'success' || decision === 'drop') {
        changed = true;
        continue;
      }

      if (decision === 'defer') {
        nextTasks.push(task);
        continue;
      }

      const attempts = task.attempts + 1;
      if (attempts >= MAX_OUTBOX_ATTEMPTS) {
        changed = true;
        continue;
      }
      nextTasks.push({
        ...task,
        attempts,
        nextAttemptAt: now + backoffMs(attempts),
      });
      changed = true;
    }

    if (changed) {
      writeOutbox(nextTasks);
    }
  } finally {
    isFlushing = false;
  }
}

export function getOutboxSize(): number {
  return readOutbox().length;
}

export function getOutboxStats(): OutboxStats {
  return getOutboxStatsFromTasks(readOutbox());
}

export function getOutboxMessageIndicators(chatId: string): Record<string, OutboxMessageIndicator> {
  return buildOutboxMessageIndicators(readOutbox(), chatId);
}

export function clearOutbox(): void {
  writeOutbox([]);
}
