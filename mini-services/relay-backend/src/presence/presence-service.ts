// ─── Presence System ───────────────────────────────
// Online/offline/away status broadcasting

import { prisma } from '../prisma';
import { sessionManager } from '../signaling/session-manager';
import { getPresenceAudience } from '../relay/contacts-service';

// Update account status in DB + broadcast to contacts
export async function updatePresence(accountId: string, status: 'online' | 'away' | 'offline') {
  const lastSeenValue =
    status === 'online' || status === 'offline' ? new Date() : undefined;

  await prisma.account.update({
    where: { id: accountId },
    data: {
      status,
      lastSeen: lastSeenValue,
    },
  });

  const audience = await getPresenceAudience(accountId);
  const event = {
    type: 'presence.update',
    payload: { accountId, status, timestamp: Date.now() },
  };

  // Scoped broadcast: only direct contacts / reciprocal contact graph.
  for (const peerId of audience) {
    sessionManager.sendTo(peerId, event);
  }
}

// Mark as offline when disconnecting
export async function goOffline(accountId: string) {
  await updatePresence(accountId, 'offline');
}

// Get presence status for a list of account IDs
export async function getPresence(accountIds: string[]): Promise<Record<string, { status: string; lastSeen: Date | null }>> {
  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, status: true, lastSeen: true },
  });

  const result: Record<string, { status: string; lastSeen: Date | null }> = {};
  for (const a of accounts) {
    result[a.id] = { status: a.status, lastSeen: a.lastSeen };
  }
  return result;
}
