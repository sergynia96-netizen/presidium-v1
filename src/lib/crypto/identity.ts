/**
 * Identity Key Management for E2E Encryption
 *
 * Each user/device has a long-term identity key pair (Ed25519).
 * This key is used for:
 * - X3DH key exchange (identity verification)
 * - Signing pre-key bundles
 * - Safety number / fingerprint generation
 *
 * Keys are generated once and stored permanently in IndexedDB.
 * They are NEVER rotated (only if device is wiped or re-registered).
 */

import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from './utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface IdentityKeyPair {
  publicKey: Uint8Array;   // 32 bytes Ed25519 public key
  privateKey: Uint8Array;  // 32 bytes Ed25519 private key (seed)
}

export interface SerializedIdentityKeyPair {
  publicKey: string;       // hex-encoded
  privateKey: string;      // hex-encoded
}

// ─── Key Generation ──────────────────────────────────────────────────────────

/**
 * Generate a new Ed25519 identity key pair.
 */
export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  const { secretKey, publicKey } = ed25519.keygen();
  return { publicKey, privateKey: secretKey };
}

/**
 * Derive public key from a private key (seed).
 */
export async function derivePublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
  return ed25519.getPublicKey(privateKey);
}

// ─── Serialization ───────────────────────────────────────────────────────────

export function serializeIdentityKeyPair(keys: IdentityKeyPair): SerializedIdentityKeyPair {
  return {
    publicKey: bytesToHex(keys.publicKey),
    privateKey: bytesToHex(keys.privateKey),
  };
}

export function deserializeIdentityKeyPair(serialized: SerializedIdentityKeyPair): IdentityKeyPair {
  return {
    publicKey: hexToBytes(serialized.publicKey),
    privateKey: hexToBytes(serialized.privateKey),
  };
}

// ─── Signing ─────────────────────────────────────────────────────────────────

/**
 * Sign arbitrary data with the identity private key.
 */
export async function signWithIdentityKey(
  privateKey: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  return ed25519.sign(data, privateKey);
}

/**
 * Verify a signature made with an identity public key.
 */
export async function verifyWithIdentityKey(
  signature: Uint8Array,
  data: Uint8Array,
  publicKey: Uint8Array,
): Promise<boolean> {
  return ed25519.verify(signature, data, publicKey);
}

// ─── Fingerprint ─────────────────────────────────────────────────────────────

/**
 * Generate a safety number / fingerprint from two identity public keys.
 * Format: 6 groups of 5 digits (30 digits total).
 */
export async function generateFingerprint(
  localIdentityPublicKey: Uint8Array,
  remoteIdentityPublicKey: Uint8Array,
): Promise<string> {
  const combined = new Uint8Array(
    localIdentityPublicKey.length + remoteIdentityPublicKey.length,
  );
  combined.set(localIdentityPublicKey);
  combined.set(remoteIdentityPublicKey, localIdentityPublicKey.length);

  const hash = sha256(combined);

  let fingerprint = '';
  for (let i = 0; i < 15; i++) {
    fingerprint += hash[i].toString().padStart(3, '0');
  }

  const digits = fingerprint.slice(0, 30);
  const groups = digits.match(/.{1,5}/g) || [];
  return groups.join(' ');
}

/**
 * Get a short hex fingerprint for debugging/UI display.
 */
export function getShortFingerprint(publicKey: Uint8Array, length = 8): string {
  return bytesToHex(publicKey).slice(0, length);
}


