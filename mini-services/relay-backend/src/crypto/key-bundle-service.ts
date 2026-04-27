// ─── Pre-Key Bundle Management ─────────────────────
// Signal Protocol X3DH pre-key storage and retrieval

/*
 * CHANGELOG (Codex)
 * 2026-04-17:
 * - Replaced pre-key upload path with full replace transaction:
 *   `deleteMany(accountId) + createMany(keysToInsert)`.
 * - Added strict guard for missing `accountId` in upload payload assembly.
 */

import { prisma } from '../prisma';
import { ensureAccountExists } from '../auth/auth-service';

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
  const keysToInsert = [
    {
      accountId,
      preKeyId: 0,
      publicKey: signedPreKey,
      signature,
      isUsed: false,
    },
    ...oneTimePreKeys.map((key, i) => ({
      accountId,
      preKeyId: i + 1,
      publicKey: key,
      isUsed: false,
    })),
  ];

  const uploadAccountId = keysToInsert[0]?.accountId;

  if (!uploadAccountId) {
    throw new Error('Cannot upload keys: accountId is missing');
  }

  await prisma.$transaction([
    prisma.preKeyBundle.deleteMany({
      where: { accountId: uploadAccountId },
    }),
    prisma.preKeyBundle.createMany({
      data: keysToInsert,
    }),
  ]);

  return { success: true, count: oneTimePreKeys.length };
}

// Get pre-key bundle for initiating session with a user
export async function getPreKeyBundle(targetAccountId: string): Promise<KeyBundle | { error: string }> {
  // Auto-provision account if not exists (handles User ID from main app)
  await ensureAccountExists(targetAccountId);

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
