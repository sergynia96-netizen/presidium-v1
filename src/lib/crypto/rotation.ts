/**
 * Key Rotation Logic
 *
 * Signal Protocol key rotation strategy:
 * - Identity keys: NEVER rotated (only on device wipe/re-registration)
 * - Signed pre-keys: Rotated periodically (every ~2 weeks)
 * - One-time pre-keys: Replenished when count drops below threshold
 * - Ratchet keys: Rotated automatically with each DH ratchet step
 */

import {
  generateSignedPreKey,
  generateOneTimePreKeys,
  createPreKeyBundle,
  serializePreKeyBundle,
  PREKEY_COUNT,
  type LocalPreKeyBundle,
  type PreKeyPair,
} from './prekeys';
import {
  getPreKeyBundle,
  uploadPreKeyBundle,
  type StoredPreKeyBundle,
} from './store';
import { getAllSessions, deleteSession } from './encrypt';
import { generateIdentityKeyPair, serializeIdentityKeyPair, type IdentityKeyPair } from './identity';

// ─── Constants ───────────────────────────────────────────────────────────────

export const SIGNED_PREKEY_ROTATION_INTERVAL = 14 * 24 * 60 * 60 * 1000;
export const MIN_ONE_TIME_PREKEYS = PREKEY_COUNT / 2;
export const MAX_SESSION_AGE = 30 * 24 * 60 * 60 * 1000;

// ─── Signed Pre-Key Rotation ─────────────────────────────────────────────────

export async function rotateSignedPreKey(
  identityKeyPair: IdentityKeyPair,
): Promise<LocalPreKeyBundle> {
  const stored = await getPreKeyBundle('prekeys');
  if (!stored) {
    throw new Error('No pre-key bundle found. Run getOrCreatePreKeys() first.');
  }

  const storedBundle = stored as StoredPreKeyBundle;
  const newKeyId = storedBundle.signedPreKey.keyId + 1;
  const newSignedPreKey = await generateSignedPreKey(identityKeyPair, newKeyId);

  let oneTimeKeys: PreKeyPair[] = [];
  if (storedBundle.oneTimePreKeys) {
    oneTimeKeys = generateOneTimePreKeys(
      Math.max(0, PREKEY_COUNT - storedBundle.oneTimePreKeys.length),
      Math.max(0, ...storedBundle.oneTimePreKeys.map(k => k.keyId)) + 1,
    );
  }

  const newBundle: LocalPreKeyBundle = {
    identityKey: identityKeyPair.publicKey,
    signedPreKey: {
      keyId: newSignedPreKey.keyId,
      publicKey: newSignedPreKey.publicKey,
      privateKey: newSignedPreKey.privateKey,
      signature: newSignedPreKey.signature,
    },
    oneTimePreKeys: oneTimeKeys,
  };

  await uploadPreKeyBundle('prekeys', serializePreKeyBundle(newBundle));
  return newBundle;
}

export function isSignedPreKeyRotationDue(lastRotationTime: number): boolean {
  return Date.now() - lastRotationTime > SIGNED_PREKEY_ROTATION_INTERVAL;
}

// ─── One-Time Pre-Key Replenishment ─────────────────────────────────────────

export function needsPreKeyReplenishment(currentCount: number): boolean {
  return currentCount < MIN_ONE_TIME_PREKEYS;
}

export async function replenishPreKeys(
  _identityKeyPair: IdentityKeyPair,
  currentBundle: LocalPreKeyBundle,
): Promise<LocalPreKeyBundle> {
  const maxId = Math.max(0, ...currentBundle.oneTimePreKeys.map(k => k.keyId));
  const needed = PREKEY_COUNT - currentBundle.oneTimePreKeys.length;

  if (needed <= 0) return currentBundle;

  const newKeys = generateOneTimePreKeys(needed, maxId + 1);

  const newBundle: LocalPreKeyBundle = {
    ...currentBundle,
    oneTimePreKeys: [...currentBundle.oneTimePreKeys, ...newKeys],
  };

  await uploadPreKeyBundle('prekeys', serializePreKeyBundle(newBundle));
  return newBundle;
}

// ─── Session Cleanup ─────────────────────────────────────────────────────────

export function cleanupStaleSessions(maxAgeMs = MAX_SESSION_AGE): string[] {
  const allSessions = getAllSessions();
  const removed: string[] = [];
  const now = Date.now();

  for (const [recipientId, session] of allSessions) {
    if (now - session.lastUsedAt > maxAgeMs) {
      deleteSession(recipientId);
      removed.push(recipientId);
    }
  }

  return removed;
}

export function cleanupUserSessions(userId: string): boolean {
  const session = getAllSessions().get(userId);
  if (session) {
    deleteSession(userId);
    return true;
  }
  return false;
}

// ─── Identity Key Rotation (Emergency Only) ─────────────────────────────────

export async function rotateIdentityKeys(): Promise<{
  newIdentityKeyPair: IdentityKeyPair;
  newPreKeyBundle: LocalPreKeyBundle;
}> {
  const newIdentityKeyPair = await generateIdentityKeyPair();
  const oneTimeKeys = generateOneTimePreKeys(PREKEY_COUNT, 0);
  const newPreKeyBundle = await createPreKeyBundle(newIdentityKeyPair, 1, oneTimeKeys);

  await uploadPreKeyBundle('identity', serializeIdentityKeyPair(newIdentityKeyPair));
  await uploadPreKeyBundle('prekeys', serializePreKeyBundle(newPreKeyBundle));

  cleanupStaleSessions(0);

  return { newIdentityKeyPair, newPreKeyBundle };
}

// ─── Automated Rotation Scheduler ───────────────────────────────────────────

export async function checkAndRotateKeys(
  identityKeyPair: IdentityKeyPair,
  lastRotationTime: number,
): Promise<{ rotated: boolean; reasons: string[] }> {
  const reasons: string[] = [];

  if (isSignedPreKeyRotationDue(lastRotationTime)) {
    await rotateSignedPreKey(identityKeyPair);
    reasons.push('signed-pre-key-expired');
  }

  const stored = await getPreKeyBundle('prekeys');
  if (stored) {
    const storedBundle = stored as StoredPreKeyBundle;
    const currentCount = storedBundle.oneTimePreKeys?.length || 0;
    if (needsPreKeyReplenishment(currentCount)) {
      // Replenishment requires local private keys, which are only available
      // through getOrCreatePreKeys(). This function just reports the need.
      reasons.push('pre-keys-low-requires-refresh');
    }
  }

  const removed = cleanupStaleSessions();
  if (removed.length > 0) {
    reasons.push(`stale-sessions-removed:${removed.length}`);
  }

  return { rotated: reasons.length > 0, reasons };
}
