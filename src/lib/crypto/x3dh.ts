/**
 * X3DH (Extended Triple Diffie-Hellman) Key Exchange
 *
 * X3DH establishes a shared secret between two parties who may not be online simultaneously.
 *
 * DH calculations:
 * DH1 = DH(IK_A, SPK_B)
 * DH2 = DH(EK_A, IK_B)
 * DH3 = DH(EK_A, SPK_B)
 * DH4 = DH(EK_A, OPK_B)  (optional)
 *
 * SK = KDF(DH1 || DH2 || DH3 || DH4)
 */

import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import type { IdentityKeyPair } from './identity';
import type { PreKeyBundle, SignedPreKeyPair, PreKeyPair } from './prekeys';
import { bytesToHex, hexToBytes } from './utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface X3DHSharedSecret {
  sharedSecret: Uint8Array;
  dhResults: {
    dh1: Uint8Array;
    dh2: Uint8Array;
    dh3: Uint8Array;
    dh4?: Uint8Array;
  };
  usedOneTimePreKeyId?: number;
}

export interface X3DHEphemeralKeys {
  ephemeralPublicKey: Uint8Array;
  ephemeralPrivateKey: Uint8Array;
}

// ─── Ed25519 → X25519 Conversion ────────────────────────────────────────────

/**
 * Convert an Ed25519 public key to X25519 (Montgomery) form.
 */
export function ed25519ToX25519PublicKey(edPublicKey: Uint8Array): Uint8Array {
  return ed25519.utils.toMontgomery(edPublicKey);
}

/**
 * Convert an Ed25519 private key to X25519 private key.
 */
export function ed25519ToX25519PrivateKey(edPrivateKey: Uint8Array): Uint8Array {
  return ed25519.utils.toMontgomerySecret(edPrivateKey);
}

// ─── X25519 Diffie-Hellman ──────────────────────────────────────────────────

/**
 * Perform X25519 Diffie-Hellman key exchange.
 */
export function x25519DH(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(privateKey, publicKey);
}

// ─── Ephemeral Key Generation ───────────────────────────────────────────────

/**
 * Generate ephemeral X25519 key pair for X3DH initiation.
 */
export function generateEphemeralKeys(): X3DHEphemeralKeys {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);

  return { ephemeralPublicKey: publicKey, ephemeralPrivateKey: privateKey };
}

// ─── X3DH Initiator (Alice) ─────────────────────────────────────────────────

/**
 * X3DH key agreement from the initiator's perspective (Alice).
 */
export function x3dhInitiate(
  identityKeyPair: IdentityKeyPair,
  bobBundle: PreKeyBundle,
  ephemeralKeys: X3DHEphemeralKeys,
): X3DHSharedSecret {
  // Convert Ed25519 identity keys to X25519
  const aliceIkX = ed25519ToX25519PrivateKey(identityKeyPair.privateKey);
  const bobIkX = ed25519ToX25519PublicKey(bobBundle.identityKey);

  // DH1 = DH(IK_A, SPK_B)
  const dh1 = x25519DH(aliceIkX, bobBundle.signedPreKey.publicKey);

  // DH2 = DH(EK_A, IK_B)
  const dh2 = x25519DH(ephemeralKeys.ephemeralPrivateKey, bobIkX);

  // DH3 = DH(EK_A, SPK_B)
  const dh3 = x25519DH(ephemeralKeys.ephemeralPrivateKey, bobBundle.signedPreKey.publicKey);

  // DH4 = DH(EK_A, OPK_B)
  let dh4: Uint8Array | undefined;
  let usedOneTimePreKeyId: number | undefined;

  if (bobBundle.oneTimePreKeys.length > 0) {
    const opk = bobBundle.oneTimePreKeys[0];
    dh4 = x25519DH(ephemeralKeys.ephemeralPrivateKey, opk.publicKey);
    usedOneTimePreKeyId = opk.keyId;
  }

  // SK = KDF(DH1 || DH2 || DH3 || DH4)
  const sharedSecret = deriveX3DHSharedSecret(dh1, dh2, dh3, dh4);

  return {
    sharedSecret,
    dhResults: { dh1, dh2, dh3, dh4 },
    usedOneTimePreKeyId,
  };
}

// ─── X3DH Responder (Bob) ───────────────────────────────────────────────────

/**
 * X3DH key agreement from the responder's perspective (Bob).
 */
export function x3dhRespond(
  identityKeyPair: IdentityKeyPair,
  signedPreKey: SignedPreKeyPair,
  oneTimePreKey: PreKeyPair | null,
  aliceIdentityKey: Uint8Array,
  aliceEphemeralKey: Uint8Array,
): X3DHSharedSecret {
  const bobIkX = ed25519ToX25519PrivateKey(identityKeyPair.privateKey);
  const aliceIkX = ed25519ToX25519PublicKey(aliceIdentityKey);

  // DH1 = DH(SPK_B, IK_A)
  const dh1 = x25519DH(signedPreKey.privateKey, aliceIkX);

  // DH2 = DH(IK_B, EK_A)
  const dh2 = x25519DH(bobIkX, aliceEphemeralKey);

  // DH3 = DH(SPK_B, EK_A)
  const dh3 = x25519DH(signedPreKey.privateKey, aliceEphemeralKey);

  // DH4 = DH(OPK_B, EK_A)
  let dh4: Uint8Array | undefined;

  if (oneTimePreKey) {
    dh4 = x25519DH(oneTimePreKey.privateKey, aliceEphemeralKey);
  }

  const sharedSecret = deriveX3DHSharedSecret(dh1, dh2, dh3, dh4);

  return {
    sharedSecret,
    dhResults: { dh1, dh2, dh3, dh4 },
  };
}

// ─── Key Derivation ──────────────────────────────────────────────────────────

const X3DH_INFO = new TextEncoder().encode('Presidium X3DH Shared Secret');

/**
 * Derive the shared secret from DH outputs using HKDF-SHA256.
 */
export function deriveX3DHSharedSecret(
  dh1: Uint8Array,
  dh2: Uint8Array,
  dh3: Uint8Array,
  dh4?: Uint8Array,
): Uint8Array {
  const totalLength = dh1.length + dh2.length + dh3.length + (dh4 ? dh4.length : 0);
  const concatenated = new Uint8Array(totalLength);
  let offset = 0;
  concatenated.set(dh1, offset); offset += dh1.length;
  concatenated.set(dh2, offset); offset += dh2.length;
  concatenated.set(dh3, offset); offset += dh3.length;
  if (dh4) {
    concatenated.set(dh4, offset);
  }

  return hkdf(sha256, concatenated, new Uint8Array(0), X3DH_INFO, 32);
}

// ─── Serialization ───────────────────────────────────────────────────────────

export interface SerializedX3DHInitiate {
  identityKey: string;
  ephemeralKey: string;
  signedPreKeyId: number;
  oneTimePreKeyId?: number;
}

export function serializeX3DHInitiate(
  identityKey: Uint8Array,
  ephemeralKey: Uint8Array,
  signedPreKeyId: number,
  oneTimePreKeyId?: number,
): SerializedX3DHInitiate {
  return {
    identityKey: bytesToHex(identityKey),
    ephemeralKey: bytesToHex(ephemeralKey),
    signedPreKeyId,
    oneTimePreKeyId,
  };
}

export function deserializeX3DHInitiate(serialized: SerializedX3DHInitiate) {
  return {
    identityKey: hexToBytes(serialized.identityKey),
    ephemeralKey: hexToBytes(serialized.ephemeralKey),
    signedPreKeyId: serialized.signedPreKeyId,
    oneTimePreKeyId: serialized.oneTimePreKeyId,
  };
}


