/**
 * Safety Number / Fingerprint Verification
 *
 * Allows users to verify they are communicating with the correct person
 * by comparing safety numbers out-of-band.
 */

import { bytesToHex, hexToBytes } from './utils';
import { generateFingerprint as generateIdentityFingerprint, getShortFingerprint } from './identity';
import type { IdentityKeyPair } from './identity';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SafetyNumber {
  local: string;
  remote: string;
  combined: string;
}

export interface VerificationResult {
  isVerified: boolean;
  localFingerprint: string;
  remoteFingerprint: string;
  mismatch: boolean;
}

export interface TrustRecord {
  userId: string;
  identityKey: string;
  verifiedAt: number;
  verificationMethod: 'manual' | 'qr-scan' | 'qr-show' | 'safety-number';
}

// ─── Safety Number Generation ───────────────────────────────────────────────

export async function generateSafetyNumbers(
  localIdentityKeyPair: IdentityKeyPair,
  remoteIdentityPublicKey: Uint8Array,
): Promise<SafetyNumber> {
  const localFingerprint = getShortFingerprint(localIdentityKeyPair.publicKey, 16);
  const remoteFingerprint = getShortFingerprint(remoteIdentityPublicKey, 16);

  const combined = await generateIdentityFingerprint(
    localIdentityKeyPair.publicKey,
    remoteIdentityPublicKey,
  );

  return {
    local: localFingerprint,
    remote: remoteFingerprint,
    combined,
  };
}

export function generateQRFingerprint(
  userId: string,
  identityPublicKey: Uint8Array,
): string {
  return `presidium:${userId}:${bytesToHex(identityPublicKey)}`;
}

export function parseQRFingerprint(qrData: string): {
  userId: string;
  identityPublicKey: Uint8Array;
} | null {
  const parts = qrData.split(':');
  if (parts.length !== 3 || parts[0] !== 'presidium') {
    return null;
  }

  try {
    return {
      userId: parts[1],
      identityPublicKey: hexToBytes(parts[2]),
    };
  } catch {
    return null;
  }
}

// ─── Verification ───────────────────────────────────────────────────────────

export function verifyIdentityKey(
  expectedFingerprint: string,
  actualIdentityPublicKey: Uint8Array,
): VerificationResult {
  const actualFingerprint = getShortFingerprint(actualIdentityPublicKey, 16);
  const mismatch = actualFingerprint !== expectedFingerprint;

  return {
    isVerified: !mismatch,
    localFingerprint: expectedFingerprint,
    remoteFingerprint: actualFingerprint,
    mismatch,
  };
}

export function compareSafetyNumbers(
  number1: string,
  number2: string,
): boolean {
  const normalize = (s: string) => s.replace(/\s/g, '').toLowerCase();
  return normalize(number1) === normalize(number2);
}

// ─── Visual Fingerprint ─────────────────────────────────────────────────────

export function generateVisualFingerprint(identityPublicKey: Uint8Array): number[][] {
  const hash = new Uint8Array(49);
  for (let i = 0; i < 49; i++) {
    hash[i] = identityPublicKey[i % identityPublicKey.length] ^ (i * 7);
  }

  const grid: number[][] = [];
  for (let row = 0; row < 7; row++) {
    const rowValues: number[] = [];
    for (let col = 0; col < 7; col++) {
      rowValues.push(hash[row * 7 + col] % 6);
    }
    grid.push(rowValues);
  }

  return grid;
}

// ─── Trust Management ───────────────────────────────────────────────────────

const TRUST_STORAGE_KEY = 'presidium-trust-records';

export function getTrustRecords(): TrustRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(TRUST_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function saveTrustRecord(record: TrustRecord): void {
  if (typeof window === 'undefined') return;
  const records = getTrustRecords();
  const filtered = records.filter(r => r.userId !== record.userId);
  filtered.push(record);
  localStorage.setItem(TRUST_STORAGE_KEY, JSON.stringify(filtered));
}

export function isContactVerified(userId: string, identityKey: string): boolean {
  const records = getTrustRecords();
  return records.some(
    r => r.userId === userId && r.identityKey === identityKey,
  );
}

export function removeTrustRecord(userId: string): void {
  const records = getTrustRecords();
  const filtered = records.filter(r => r.userId !== userId);
  localStorage.setItem(TRUST_STORAGE_KEY, JSON.stringify(filtered));
}
