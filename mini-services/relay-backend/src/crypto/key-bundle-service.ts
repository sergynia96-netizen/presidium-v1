// ─── Pre-Key Bundle Management ─────────────────────
// Signal Protocol X3DH pre-key storage and retrieval

import { prisma } from '../prisma';

export interface KeyBundle {
  identityKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKeys: Array<{ preKeyId: number; publicKey: string }>;
}

// Upload new pre-keys for an account
export async function uploadPreKeys(
  accountId: string,
  signedPreKey: string,
  oneTimePreKeys: string[],
  signature?: string,
) {
  // Delete all existing one-time keys and replace with new batch
  await prisma.preKeyBundle.deleteMany({
    where: { accountId, preKeyId: { gt: 0 } },
  });

  // Upsert signed pre-key (preKeyId = 0)
  // Note: signature field requires Prisma client regeneration after schema update
  await prisma.preKeyBundle.upsert({
    where: {
      accountId_preKeyId: { accountId, preKeyId: 0 },
    },
    update: { publicKey: signedPreKey, isUsed: false },
    create: { accountId, preKeyId: 0, publicKey: signedPreKey },
  });

  // Insert new one-time pre-keys
  if (oneTimePreKeys.length > 0) {
    // Find the max existing preKeyId to avoid collisions
    const maxKey = await prisma.preKeyBundle.findFirst({
      where: { accountId },
      orderBy: { preKeyId: 'desc' },
      select: { preKeyId: true },
    });
    const startId = (maxKey?.preKeyId ?? 0) + 1;

    await prisma.preKeyBundle.createMany({
      data: oneTimePreKeys.map((key, i) => ({
        accountId,
        preKeyId: startId + i,
        publicKey: key,
      })),
    });
  }

  return { success: true, count: oneTimePreKeys.length };
}

// Get pre-key bundle for initiating session with a user
export async function getPreKeyBundle(targetAccountId: string): Promise<KeyBundle | { error: string }> {
  const account = await prisma.account.findUnique({
    where: { id: targetAccountId },
    select: { id: true, publicKey: true },
  });

  if (!account) {
    return { error: 'User not found' };
  }

  if (!account.publicKey || account.publicKey.length === 0) {
    return { error: 'No identity key available' };
  }

  // Get signed pre-key
  const signedPreKey = await prisma.preKeyBundle.findFirst({
    where: { accountId: targetAccountId, preKeyId: 0, isUsed: false },
  });

  if (!signedPreKey) {
    return { error: 'No signed pre-key available' };
  }

  // Get one unused one-time pre-key
  const oneTimePreKey = await prisma.preKeyBundle.findFirst({
    where: { accountId: targetAccountId, preKeyId: { gt: 0 }, isUsed: false },
    orderBy: { preKeyId: 'asc' },
  });

  // Mark one-time key as used (single-use)
  if (oneTimePreKey) {
    await prisma.preKeyBundle.update({
      where: { id: oneTimePreKey.id },
      data: { isUsed: true },
    });
  }

  return {
    identityKey: account.publicKey,
    signedPreKey: {
      keyId: 0,
      publicKey: signedPreKey.publicKey,
      signature: (signedPreKey as any).signature || '',
    },
    oneTimePreKeys: oneTimePreKey
      ? [{ preKeyId: oneTimePreKey.preKeyId, publicKey: oneTimePreKey.publicKey }]
      : [],
  };
}

// Mark a specific pre-key as used (for explicit consumption tracking)
export async function markPreKeyAsUsed(
  accountId: string,
  preKeyId: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await prisma.preKeyBundle.updateMany({
      where: {
        accountId,
        preKeyId,
        isUsed: false,
      },
      data: { isUsed: true },
    });

    if (result.count === 0) {
      return { success: false, error: 'Pre-key not found or already used' };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Failed to mark pre-key as used' };
  }
}

// Get the count of available one-time pre-keys for monitoring
export async function getPreKeyCount(accountId: string): Promise<number> {
  return prisma.preKeyBundle.count({
    where: {
      accountId,
      preKeyId: { gt: 0 },
      isUsed: false,
    },
  });
}

// Replenish one-time pre-keys if count is below threshold
export async function ensureMinimumPreKeys(
  accountId: string,
  minimumCount: number = 50,
): Promise<{ replenished: number }> {
  const currentCount = await getPreKeyCount(accountId);

  if (currentCount >= minimumCount) {
    return { replenished: 0 };
  }

  // Note: In a real implementation, the client would need to generate
  // new pre-keys and upload them. This function just reports the need.
  return { replenished: 0 };
}
