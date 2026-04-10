/**
 * Pre-Key Bundle Management for X3DH
 *
 * Signal Protocol uses pre-keys for asynchronous session initiation.
 * Each device maintains:
 * - 1 signed pre-key (rotated periodically, signed by identity key)
 * - 100 one-time pre-keys (consumed on first use, replenished)
 */

import { x25519 } from '@noble/curves/ed25519.js';
import { signWithIdentityKey, verifyWithIdentityKey } from './identity';
import type { IdentityKeyPair } from './identity';
import { bytesToHex, hexToBytes } from './utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PreKeyPair {
  keyId: number;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface SignedPreKeyPair {
  keyId: number;
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  signature: Uint8Array;
}

export interface PreKeyBundle {
  identityKey: Uint8Array;
  signedPreKey: {
    keyId: number;
    publicKey: Uint8Array;
    signature: Uint8Array;
  };
  oneTimePreKeys: {
    keyId: number;
    publicKey: Uint8Array;
  }[];
}

/**
 * Local pre-key bundle WITH private keys.
 * Only stored locally, never sent to the relay.
 */
export interface LocalPreKeyBundle {
  identityKey: Uint8Array;
  signedPreKey: SignedPreKeyPair;
  oneTimePreKeys: PreKeyPair[];
}

export interface SerializedPreKeyBundle {
  identityKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  oneTimePreKeys: {
    keyId: number;
    publicKey: string;
  }[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const PREKEY_COUNT = 100;
export const MAX_PREKEY_ID = 0xFFFFFF;

// ─── X25519 Key Generation ──────────────────────────────────────────────────

/**
 * Generate an X25519 key pair for Diffie-Hellman.
 */
export function generateX25519KeyPair(): PreKeyPair {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);

  return {
    keyId: 0,
    publicKey,
    privateKey,
  };
}

/**
 * Generate a signed pre-key pair.
 */
export async function generateSignedPreKey(
  identityKeyPair: IdentityKeyPair,
  keyId: number,
): Promise<SignedPreKeyPair> {
  const keyPair = generateX25519KeyPair();

  // Convert Ed25519 identity private key to X25519 for signing
  const signature = await signWithIdentityKey(
    identityKeyPair.privateKey,
    keyPair.publicKey,
  );

  return {
    keyId,
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    signature,
  };
}

/**
 * Generate a batch of one-time pre-keys.
 */
export function generateOneTimePreKeys(
  count: number,
  startId: number,
): PreKeyPair[] {
  const keys: PreKeyPair[] = [];
  for (let i = 0; i < count; i++) {
    const keyPair = generateX25519KeyPair();
    keys.push({
      keyId: (startId + i) % (MAX_PREKEY_ID + 1),
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
    });
  }
  return keys;
}

// ─── Bundle Creation ─────────────────────────────────────────────────────────

/**
 * Create a complete pre-key bundle for upload to the relay.
 */
export async function createPreKeyBundle(
  identityKeyPair: IdentityKeyPair,
  signedPreKeyId: number,
  oneTimePreKeys: PreKeyPair[],
): Promise<LocalPreKeyBundle> {
  const signedPreKey = await generateSignedPreKey(identityKeyPair, signedPreKeyId);

  return {
    identityKey: identityKeyPair.publicKey,
    signedPreKey,
    oneTimePreKeys,
  };
}

// ─── Serialization ───────────────────────────────────────────────────────────

export function serializePreKeyBundle(bundle: PreKeyBundle | LocalPreKeyBundle): SerializedPreKeyBundle {
  return {
    identityKey: bytesToHex(bundle.identityKey),
    signedPreKey: {
      keyId: bundle.signedPreKey.keyId,
      publicKey: bytesToHex(bundle.signedPreKey.publicKey),
      signature: bytesToHex(bundle.signedPreKey.signature),
    },
    oneTimePreKeys: bundle.oneTimePreKeys.map(k => ({
      keyId: k.keyId,
      publicKey: bytesToHex(k.publicKey),
    })),
  };
}

export function deserializePreKeyBundle(serialized: SerializedPreKeyBundle): PreKeyBundle {
  return {
    identityKey: hexToBytes(serialized.identityKey),
    signedPreKey: {
      keyId: serialized.signedPreKey.keyId,
      publicKey: hexToBytes(serialized.signedPreKey.publicKey),
      signature: hexToBytes(serialized.signedPreKey.signature),
    },
    oneTimePreKeys: serialized.oneTimePreKeys.map(k => ({
      keyId: k.keyId,
      publicKey: hexToBytes(k.publicKey),
    })),
  };
}

// ─── Verification ────────────────────────────────────────────────────────────

/**
 * Verify the signature on a signed pre-key.
 */
export async function verifySignedPreKey(
  identityPublicKey: Uint8Array,
  signedPreKeyPublicKey: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  return verifyWithIdentityKey(signature, signedPreKeyPublicKey, identityPublicKey);
}


