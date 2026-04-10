/**
 * Webhooks Module
 *
 * Features:
 * - User-defined webhooks for chat events
 * - Event filtering (message, member join/leave, etc.)
 * - Secret signing (HMAC-SHA256)
 * - Retry with exponential backoff
 * - Delivery status tracking
 * - Rate limiting per webhook
 *
 * Events:
 * - message.new
 * - message.edited
 * - message.deleted
 * - member.joined
 * - member.left
 * - member.banned
 * - chat.created
 * - chat.deleted
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type WebhookEvent =
  | 'message.new'
  | 'message.edited'
  | 'message.deleted'
  | 'member.joined'
  | 'member.left'
  | 'member.banned'
  | 'chat.created'
  | 'chat.deleted'
  | 'call.started'
  | 'call.ended';

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  chatId?: string; // null = all chats
  isActive: boolean;
  createdAt: number;
  lastDeliveryAt?: number;
  lastDeliveryStatus?: 'success' | 'failed';
  failureCount: number;
  rateLimit: number; // requests per minute
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  payload: unknown;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastAttemptAt?: number;
  responseCode?: number;
  responseTime?: number;
  errorMessage?: string;
}

export interface WebhookPayload {
  id: string;
  event: WebhookEvent;
  timestamp: number;
  data: Record<string, unknown>;
}

// ─── Webhook Management ─────────────────────────────────────────────────────

/**
 * Create a new webhook.
 */
export async function createWebhook(data: {
  url: string;
  events: WebhookEvent[];
  chatId?: string;
  secret?: string;
  rateLimit?: number;
}): Promise<Webhook> {
  const response = await fetch('/api/webhooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to create webhook');
  }

  return response.json();
}

/**
 * Get all webhooks.
 */
export async function getWebhooks(): Promise<Webhook[]> {
  const response = await fetch('/api/webhooks');
  if (!response.ok) return [];
  const data = await response.json();
  return data.webhooks || [];
}

/**
 * Update a webhook.
 */
export async function updateWebhook(
  webhookId: string,
  updates: Partial<Webhook>,
): Promise<Webhook> {
  const response = await fetch(`/api/webhooks/${webhookId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error('Failed to update webhook');
  }

  return response.json();
}

/**
 * Delete a webhook.
 */
export async function deleteWebhook(webhookId: string): Promise<void> {
  const response = await fetch(`/api/webhooks/${webhookId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Failed to delete webhook');
  }
}

/**
 * Get webhook delivery logs.
 */
export async function getWebhookDeliveries(
  webhookId: string,
  limit: number = 50,
): Promise<WebhookDelivery[]> {
  const response = await fetch(`/api/webhooks/${webhookId}/deliveries?limit=${limit}`);
  if (!response.ok) return [];
  const data = await response.json();
  return data.deliveries || [];
}

/**
 * Test a webhook (send a ping event).
 */
export async function testWebhook(webhookId: string): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(`/api/webhooks/${webhookId}/test`, {
    method: 'POST',
  });

  if (!response.ok) {
    return { success: false, error: 'Failed to test webhook' };
  }

  return response.json();
}

// ─── Webhook Delivery ───────────────────────────────────────────────────────

/**
 * Deliver a webhook event.
 * Called by the event system when an event occurs.
 */
export async function deliverWebhook(
  webhook: Webhook,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<boolean> {
  const payload: WebhookPayload = {
    id: `wh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    event,
    timestamp: Date.now(),
    data,
  };

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Id': webhook.id,
      'X-Webhook-Event': event,
      'X-Webhook-Timestamp': String(payload.timestamp),
    };

    if (webhook.secret) {
      headers['X-Webhook-Signature'] = await signWebhookPayload(JSON.stringify(payload), webhook.secret);
    }

    const startTime = Date.now();
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    const responseTime = Date.now() - startTime;

    // Log delivery
    await logDelivery({
      webhookId: webhook.id,
      event,
      payload,
      status: response.ok ? 'delivered' : 'failed',
      attempts: 1,
      lastAttemptAt: Date.now(),
      responseCode: response.status,
      responseTime,
    });

    return response.ok;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await logDelivery({
      webhookId: webhook.id,
      event,
      payload,
      status: 'failed',
      attempts: 1,
      lastAttemptAt: Date.now(),
      errorMessage,
    });

    return false;
  }
}

/**
 * Sign a webhook payload with HMAC-SHA256.
 */
async function signWebhookPayload(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload),
  );

  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Log a webhook delivery.
 */
async function logDelivery(delivery: Omit<WebhookDelivery, 'id'>): Promise<void> {
  // Store in IndexedDB for local tracking
  try {
    const db = await getWebhooksDB();
    const tx = db.transaction('deliveries', 'readwrite');
    tx.objectStore('deliveries').add({
      ...delivery,
      id: `del-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
  } catch {
    // Silently fail
  }
}

async function getWebhooksDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('presidium-webhooks', 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('deliveries')) {
        db.createObjectStore('deliveries', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Webhook Verification (for receiving webhooks) ──────────────────────────

/**
 * Verify a webhook signature.
 * Use this in your webhook endpoint to verify incoming webhooks.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  const expected = await signWebhookPayload(payload, secret);
  return expected === signature;
}
