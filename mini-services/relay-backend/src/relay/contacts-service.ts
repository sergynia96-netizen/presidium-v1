// ─── Contacts Service ──────────────────────────────

import { prisma } from '../prisma';

export interface ContactWithInfo {
  id: string;
  contactId: string;
  nickname: string | null;
  blocked: boolean;
  muted: boolean;
  createdAt: Date;
  contact: {
    id: string;
    displayName: string;
    username: string | null;
    publicKey: string;
    status: string;
  };
}

// Get all contacts for an account
export async function getContacts(accountId: string): Promise<ContactWithInfo[]> {
  return prisma.contact.findMany({
    where: { ownerId: accountId },
    include: {
      target: {
        select: { id: true, displayName: true, username: true, publicKey: true, status: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  }).then((contacts) =>
    contacts.map((c) => ({
      id: c.id,
      contactId: c.contactId,
      nickname: c.nickname,
      blocked: c.blocked,
      muted: c.muted,
      createdAt: c.createdAt,
      contact: c.target,
    }))
  );
}

// Add a contact
export async function addContact(accountId: string, contactId: string, nickname?: string) {
  // Check if contact account exists
  const target = await prisma.account.findUnique({
    where: { id: contactId },
    select: { id: true },
  });
  if (!target) {
    return { error: 'User not found' };
  }

  // Check not self
  if (accountId === contactId) {
    return { error: 'Cannot add yourself' };
  }

  // Check not already a contact
  const existing = await prisma.contact.findUnique({
    where: { ownerId_contactId: { ownerId: accountId, contactId } },
  });
  if (existing) {
    return { error: 'Already a contact' };
  }

  const contact = await prisma.contact.create({
    data: { ownerId: accountId, contactId, nickname },
    include: {
      target: {
        select: { id: true, displayName: true, username: true, publicKey: true, status: true },
      },
    },
  });

  return {
    success: true,
    contact: {
      id: contact.id,
      contactId: contact.contactId,
      nickname: contact.nickname,
      blocked: contact.blocked,
      muted: contact.muted,
      createdAt: contact.createdAt,
      contact: contact.target,
    },
  };
}

// Remove a contact
export async function removeContact(accountId: string, contactId: string) {
  await prisma.contact.deleteMany({
    where: { ownerId: accountId, contactId },
  });
  return { success: true };
}

// Block / unblock
export async function toggleBlock(accountId: string, contactId: string, blocked: boolean) {
  await prisma.contact.updateMany({
    where: { ownerId: accountId, contactId },
    data: { blocked },
  });
  return { success: true };
}

// Search users by username or display name
export async function searchUsers(query: string, excludeId: string) {
  const lower = query.toLowerCase();
  const users = await prisma.account.findMany({
    where: {
      AND: [
        { id: { not: excludeId } },
        {
          OR: [
            { username: { contains: lower } },
            { displayName: { contains: lower } },
          ],
        },
      ],
    },
    select: { id: true, displayName: true, username: true, status: true },
    take: 20,
  });

  return users;
}

// Check if communication is blocked in either direction.
// If A blocked B or B blocked A, routing must stop.
export async function isCommunicationBlocked(accountA: string, accountB: string): Promise<boolean> {
  const blocked = await prisma.contact.findFirst({
    where: {
      blocked: true,
      OR: [
        { ownerId: accountA, contactId: accountB },
        { ownerId: accountB, contactId: accountA },
      ],
    },
    select: { id: true },
  });

  return Boolean(blocked);
}

// Build a scoped audience for presence updates:
// - direct contacts of the user
// - users who added this account as contact
// - excluding any relation with explicit block in either direction
export async function getPresenceAudience(accountId: string): Promise<string[]> {
  const [outgoing, incoming] = await Promise.all([
    prisma.contact.findMany({
      where: { ownerId: accountId, blocked: false },
      select: { contactId: true },
    }),
    prisma.contact.findMany({
      where: { contactId: accountId, blocked: false },
      select: { ownerId: true },
    }),
  ]);

  const candidates = new Set<string>();
  for (const row of outgoing) candidates.add(row.contactId);
  for (const row of incoming) candidates.add(row.ownerId);
  candidates.delete(accountId);

  const candidateIds = [...candidates];
  if (candidateIds.length === 0) return [];

  const blockedEdges = await prisma.contact.findMany({
    where: {
      blocked: true,
      OR: [
        { ownerId: accountId, contactId: { in: candidateIds } },
        { contactId: accountId, ownerId: { in: candidateIds } },
      ],
    },
    select: { ownerId: true, contactId: true },
  });

  const blockedIds = new Set<string>();
  for (const edge of blockedEdges) {
    if (edge.ownerId === accountId) blockedIds.add(edge.contactId);
    if (edge.contactId === accountId) blockedIds.add(edge.ownerId);
  }

  return candidateIds.filter((id) => !blockedIds.has(id));
}
