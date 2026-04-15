/**
 * User sync layer — mirrors Main App users to Relay for E2E identity.
 * Called after registration, profile update, or username change.
 */

interface SyncUserPayload {
  externalId: string;
  username: string;
  email: string;
  displayName?: string;
  source: 'main-app';
}

const RELAY_API_URL = process.env.RELAY_API_URL || 'http://localhost:3001';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

/**
 * Sync a user to the Relay service.
 * Uses internal API endpoint that bypasses normal auth.
 */
export async function syncUserToRelay(user: SyncUserPayload): Promise<boolean> {
  if (!RELAY_API_URL || !INTERNAL_API_KEY) {
    // Relay not configured — silently skip
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${RELAY_API_URL}/internal/sync/user`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${INTERNAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(user),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`[user-sync] Relay sync failed: ${response.status} ${response.statusText}`);
      await queueSyncRetry('user', user);
      return false;
    }

    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[user-sync] Relay sync timed out');
    } else {
      console.error('[user-sync] Failed to sync user to relay:', error);
    }
    await queueSyncRetry('user', user);
    return false;
  }
}

/**
 * Queue a sync retry for later (bull/redis queue or simple file-based queue).
 * For now, logs to a retry table in DB.
 */
async function queueSyncRetry(model: string, data: unknown): Promise<void> {
  try {
    // Simple retry log — in production, use Bull/Redis queue
    const { db } = await import('@/lib/db');
    await db.syncRetry.create({
      data: {
        model,
        data: JSON.stringify(data),
        attempts: 0,
        nextRetry: new Date(Date.now() + 60_000), // retry in 1 min
      },
    });
  } catch {
    // If we can't even log the retry, just console.error
    console.error('[user-sync] Failed to queue retry for:', model, data);
  }
}
