/**
 * High-Level E2E Encrypt/Decrypt API
 *
 * Main interface for E2E messaging. Orchestrates X3DH + Double Ratchet.
 */

import {
  generateIdentityKeyPair,
  serializeIdentityKeyPair,
  deserializeIdentityKeyPair,
  type IdentityKeyPair,
} from './identity';
import {
  createPreKeyBundle,
  generateOneTimePreKeys,
  serializePreKeyBundle,
  PREKEY_COUNT,
  type LocalPreKeyBundle,
  type PreKeyBundle,
} from './prekeys';
import { relayClient } from './relay-client';
import {
  x3dhInitiate,
  x3dhRespond,
  generateEphemeralKeys,
  serializeX3DHInitiate,
  deserializeX3DHInitiate,
  type SerializedX3DHInitiate,
} from './x3dh';
import {
  initializeRatchet,
  ratchetEncrypt,
  ratchetDecrypt,
  serializeRatchetState,
  deserializeRatchetState,
  type RatchetState,
  type RatchetMessageHeader,
  type RatchetMessage,
} from './ratchet';
import {
  getPreKeyBundle,
  uploadPreKeyBundle,
  markPreKeyAsUsed,
  storeSession,
  loadAllSessions,
  type StoredIdentityKeys,
} from './store';
import { bytesToHex, hexToBytes } from './utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface E2ESession {
  recipientId: string;
  ratchetState: RatchetState;
  isEstablished: boolean;
  createdAt: number;
  lastUsedAt: number;
  /** X3DH initiation data — populated on session creation, consumed on first message */
  pendingX3DHInitiate?: SerializedX3DHInitiate;
}

export interface EncryptedEnvelope {
  type: 'encrypted-message';
  version: 1;
  senderId: string;
  recipientId: string;
  messageId: string;
  timestamp: number;
  x3dhInitiate?: SerializedX3DHInitiate;
  ciphertext: string;
  iv: string;
  tag: string;
  header: {
    publicKey: string;
    counter: number;
    previousCounter: number;
  };
}

export interface DecryptedMessage {
  plaintext: Uint8Array;
  senderId: string;
  messageId: string;
  timestamp: number;
}

// ─── Session Store ───────────────────────────────────────────────────────────

const sessions = new Map<string, E2ESession>();

export function getSession(recipientId: string): E2ESession | undefined {
  return sessions.get(recipientId);
}

export function setSession(recipientId: string, session: E2ESession): void {
  sessions.set(recipientId, session);
}

export function deleteSession(recipientId: string): void {
  sessions.delete(recipientId);
}

export function getAllSessions(): Map<string, E2ESession> {
  return sessions;
}

// ─── Identity Key Management ─────────────────────────────────────────────────

export async function getOrCreateIdentityKeys(): Promise<IdentityKeyPair> {
  const stored = await getPreKeyBundle('identity');
  if (stored) {
    return deserializeIdentityKeyPair(stored as StoredIdentityKeys);
  }

  const keys = await generateIdentityKeyPair();
  await uploadPreKeyBundle('identity', serializeIdentityKeyPair(keys));
  return keys;
}

export async function getOrCreatePreKeys(): Promise<LocalPreKeyBundle> {
  const identityKeys = await getOrCreateIdentityKeys();

  // Always regenerate pre-keys on startup to ensure we have private keys
  // (stored bundles only contain public keys)
  const oneTimeKeys = generateOneTimePreKeys(PREKEY_COUNT, 0);
  const bundle = await createPreKeyBundle(identityKeys, 1, oneTimeKeys);

  await uploadPreKeyBundle('prekeys', serializePreKeyBundle(bundle));
  return bundle;
}

// Replenishment is now handled by getOrCreatePreKeys which always regenerates

// ─── Session Establishment ──────────────────────────────────────────────────

export async function getOrCreateSession(
  localIdentityKeys: IdentityKeyPair,
  recipientId: string,
): Promise<E2ESession> {
  const existing = getSession(recipientId);
  if (existing && existing.isEstablished) {
    existing.lastUsedAt = Date.now();
    return existing;
  }

  const remoteBundle = await fetchRemotePreKeyBundle(recipientId);
  if (!remoteBundle) {
    throw new Error(`No pre-key bundle available for ${recipientId}`);
  }

  const ephemeralKeys = generateEphemeralKeys();
  const sharedSecret = x3dhInitiate(localIdentityKeys, remoteBundle, ephemeralKeys);
  const ratchetState = initializeRatchet(sharedSecret.sharedSecret, true);

  if (sharedSecret.usedOneTimePreKeyId !== undefined) {
    await markPreKeyAsUsed(recipientId, sharedSecret.usedOneTimePreKeyId);
  }

  // Capture X3DH initiation data so the first message includes it
  const x3dhData = serializeX3DHInitiate(
    localIdentityKeys.publicKey,
    ephemeralKeys.ephemeralPublicKey,
    remoteBundle.signedPreKey.keyId,
    sharedSecret.usedOneTimePreKeyId,
  );

  const session: E2ESession = {
    recipientId,
    ratchetState,
    isEstablished: true,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    pendingX3DHInitiate: x3dhData,
  };

  setSession(recipientId, session);
  return session;
}

export async function establishResponderSession(
  localIdentityKeys: IdentityKeyPair,
  localPreKeys: LocalPreKeyBundle,
  senderId: string,
  x3dhData: SerializedX3DHInitiate,
): Promise<E2ESession> {
  const existing = getSession(senderId);
  if (existing && existing.isEstablished) {
    existing.lastUsedAt = Date.now();
    return existing;
  }

  const deserialized = deserializeX3DHInitiate(x3dhData);

  const usedOpk = x3dhData.oneTimePreKeyId !== undefined
    ? localPreKeys.oneTimePreKeys.find(k => k.keyId === x3dhData.oneTimePreKeyId) || null
    : null;

  const sharedSecret = x3dhRespond(
    localIdentityKeys,
    localPreKeys.signedPreKey,
    usedOpk,
    deserialized.identityKey,
    deserialized.ephemeralKey,
  );

  const ratchetState = initializeRatchet(sharedSecret.sharedSecret, false);
  ratchetState.remoteRatchetPublicKey = deserialized.ephemeralKey;

  const session: E2ESession = {
    recipientId: senderId,
    ratchetState,
    isEstablished: true,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
  };

  setSession(senderId, session);
  return session;
}

// ─── Encryption ─────────────────────────────────────────────────────────────

export async function encryptMessage(
  localIdentityKeys: IdentityKeyPair,
  localUserId: string,
  recipientId: string,
  plaintext: string | Uint8Array,
): Promise<EncryptedEnvelope> {
  const session = await getOrCreateSession(localIdentityKeys, recipientId);

  const plaintextBytes = typeof plaintext === 'string'
    ? new TextEncoder().encode(plaintext)
    : plaintext;

  const ratchetMessage = await ratchetEncrypt(session.ratchetState, plaintextBytes);
  session.lastUsedAt = Date.now();

  const envelope: EncryptedEnvelope = {
    type: 'encrypted-message',
    version: 1,
    senderId: localUserId,
    recipientId,
    messageId: crypto.randomUUID(),
    timestamp: Date.now(),
    ciphertext: bytesToHex(ratchetMessage.ciphertext),
    iv: bytesToHex(ratchetMessage.iv),
    tag: ratchetMessage.tag ? bytesToHex(ratchetMessage.tag) : '',
    header: {
      publicKey: bytesToHex(ratchetMessage.header.publicKey),
      counter: ratchetMessage.header.counter,
      previousCounter: ratchetMessage.header.previousCounter,
    },
  };

  // Include X3DH initiation data in the first message, then clear it
  if (session.pendingX3DHInitiate) {
    envelope.x3dhInitiate = session.pendingX3DHInitiate;
    delete session.pendingX3DHInitiate;
  }

  return envelope;
}

// ─── Decryption ─────────────────────────────────────────────────────────────

export async function decryptMessage(
  localIdentityKeys: IdentityKeyPair,
  localPreKeys: LocalPreKeyBundle,
  _localUserId: string,
  envelope: EncryptedEnvelope,
): Promise<DecryptedMessage> {
  let session = getSession(envelope.senderId);

  if (!session || !session.isEstablished) {
    if (!envelope.x3dhInitiate) {
      throw new Error('First message from sender missing X3DH initiation data');
    }

    session = await establishResponderSession(
      localIdentityKeys,
      localPreKeys,
      envelope.senderId,
      envelope.x3dhInitiate,
    );
  }

  const header: RatchetMessageHeader = {
    publicKey: hexToBytes(envelope.header.publicKey),
    counter: envelope.header.counter,
    previousCounter: envelope.header.previousCounter,
  };

  const ciphertext = hexToBytes(envelope.ciphertext);
  const iv = hexToBytes(envelope.iv);
  const tag = envelope.tag ? hexToBytes(envelope.tag) : new Uint8Array(16);

  const ratchetMessage: RatchetMessage = { header, ciphertext, iv };
  const plaintext = await ratchetDecrypt(session.ratchetState, ratchetMessage, tag);

  session.lastUsedAt = Date.now();

  return {
    plaintext,
    senderId: envelope.senderId,
    messageId: envelope.messageId,
    timestamp: envelope.timestamp,
  };
}

// ─── Relay API Helpers ──────────────────────────────────────────────────────

async function fetchRemotePreKeyBundle(recipientId: string): Promise<PreKeyBundle | null> {
  try {
    const bundle = await relayClient.fetchPreKeyBundle(recipientId);
    return bundle;
  } catch (error) {
    console.error(`[E2E] Failed to fetch pre-key bundle for ${recipientId}:`, error);
    return null;
  }
}

// ─── Session Persistence ────────────────────────────────────────────────────

export async function saveSessionsToStorage(): Promise<void> {
  for (const [recipientId, session] of sessions) {
    await storeSession(recipientId, {
      ratchetState: serializeRatchetState(session.ratchetState),
      isEstablished: session.isEstablished,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
    });
  }
}

export async function loadSessionsFromStorage(): Promise<void> {
  const stored = await loadAllSessions();
  for (const [recipientId, serialized] of stored) {
    const session: E2ESession = {
      recipientId,
      ratchetState: deserializeRatchetState(serialized.ratchetState as ReturnType<typeof serializeRatchetState>),
      isEstablished: serialized.isEstablished,
      createdAt: serialized.createdAt,
      lastUsedAt: serialized.lastUsedAt,
    };
    sessions.set(recipientId, session);
  }
}

export function cleanupStaleSessions(maxAgeMs = 30 * 24 * 60 * 60 * 1000): void {
  const now = Date.now();
  for (const [recipientId, session] of sessions) {
    if (now - session.lastUsedAt > maxAgeMs) {
      sessions.delete(recipientId);
    }
  }
}
