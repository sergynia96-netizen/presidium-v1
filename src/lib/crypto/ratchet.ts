/**
 * Double Ratchet Protocol Implementation
 *
 * Provides forward secrecy, break-in recovery, and async messaging.
 */

import { x25519 } from '@noble/curves/ed25519.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RatchetKeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export interface RatchetMessageHeader {
  publicKey: Uint8Array;
  counter: number;
  previousCounter: number;
}

export interface RatchetMessage {
  header: RatchetMessageHeader;
  ciphertext: Uint8Array;
  iv: Uint8Array;
  tag?: Uint8Array;
}

export interface SerializedRatchetState {
  rootKey: string;
  sendingChainKey: string | null;
  sendingMessageNumber: number;
  receivingChains: [string, string, number][];
  receivingChainKey: string | null;
  receivingMessageNumber: number;
  ratchetPublicKey: string;
  ratchetPrivateKey: string | null;
  remoteRatchetPublicKey: string | null;
  skippedMessageKeys: [string, string][];
  previousMessageNumber: number;
}

export interface RatchetState {
  rootKey: Uint8Array;
  sendingChainKey: Uint8Array | null;
  sendingMessageNumber: number;
  receivingChains: Map<string, { chainKey: Uint8Array; messageNumber: number }>;
  receivingChainKey: Uint8Array | null;
  receivingMessageNumber: number;
  ratchetPublicKey: Uint8Array;
  ratchetPrivateKey: Uint8Array | null;
  remoteRatchetPublicKey: Uint8Array | null;
  skippedMessageKeys: Map<string, Uint8Array>;
  previousMessageNumber: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DOUBLE_RATCHET_INFO = new TextEncoder().encode('Presidium Double Ratchet');
const MAX_SKIP_CACHE = 1000;
const MAX_RECEIVING_CHAINS = 5;

// ─── Key Generation ─────────────────────────────────────────────────────────

export function generateRatchetKeyPair(): RatchetKeyPair {
  const privateKey = x25519.utils.randomSecretKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

// ─── Initialization ─────────────────────────────────────────────────────────

export function initializeRatchet(
  sharedSecret: Uint8Array,
  isInitiator: boolean,
): RatchetState {
  const derived = hkdf(sha256, sharedSecret, new Uint8Array(0), DOUBLE_RATCHET_INFO, 64);
  const rootKey = derived.slice(0, 32);
  const chainKey = derived.slice(32, 64);

  const keyPair = generateRatchetKeyPair();

  return {
    rootKey,
    sendingChainKey: isInitiator ? chainKey : null,
    sendingMessageNumber: 0,
    receivingChains: new Map(),
    receivingChainKey: isInitiator ? null : chainKey,
    receivingMessageNumber: 0,
    ratchetPublicKey: keyPair.publicKey,
    ratchetPrivateKey: keyPair.privateKey,
    remoteRatchetPublicKey: null,
    skippedMessageKeys: new Map(),
    previousMessageNumber: 0,
  };
}

// ─── Symmetric-Key Ratchet ──────────────────────────────────────────────────

function ratchetChainKey(chainKey: Uint8Array): { nextChainKey: Uint8Array; messageKey: Uint8Array } {
  const nextChainKey = hmac(sha256, chainKey, new Uint8Array([0x01]));
  const messageKey = hmac(sha256, chainKey, new Uint8Array([0x02]));
  return { nextChainKey, messageKey };
}

// ─── AES-GCM Encryption ─────────────────────────────────────────────────────

async function aesGcmEncrypt(
  plaintext: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array; tag: Uint8Array }> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  const result = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    cryptoKey,
    plaintext as BufferSource,
  );

  const resultBytes = new Uint8Array(result);
  // Web Crypto AES-GCM appends a 16-byte authentication tag to the ciphertext
  const ciphertext = resultBytes.slice(0, -16);
  const tag = resultBytes.slice(-16);

  return { ciphertext, iv, tag };
}

async function aesGcmDecrypt(
  ciphertext: Uint8Array,
  tag: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const fullCiphertext = new Uint8Array(ciphertext.length + tag.length);
  fullCiphertext.set(ciphertext);
  fullCiphertext.set(tag, ciphertext.length);

  const result = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    cryptoKey,
    fullCiphertext as BufferSource,
  );

  return new Uint8Array(result);
}

// ─── DH Ratchet ─────────────────────────────────────────────────────────────

function dhRatchet(
  state: RatchetState,
  remotePublicKey: Uint8Array,
): Uint8Array {
  if (!state.ratchetPrivateKey) {
    throw new Error('DH ratchet: no private key available');
  }

  const dh = x25519.getSharedSecret(state.ratchetPrivateKey, remotePublicKey);
  const derived = hkdf(sha256, state.rootKey, dh, DOUBLE_RATCHET_INFO, 64);

  state.rootKey = derived.slice(0, 32);
  return derived.slice(32, 64);
}

// ─── Message Encryption ─────────────────────────────────────────────────────

export async function ratchetEncrypt(
  state: RatchetState,
  plaintext: Uint8Array,
): Promise<RatchetMessage> {
  if (!state.sendingChainKey) {
    throw new Error('No sending chain available');
  }

  const { nextChainKey, messageKey } = ratchetChainKey(state.sendingChainKey);
  state.sendingChainKey = nextChainKey;

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const { ciphertext, tag } = await aesGcmEncrypt(plaintext, messageKey, iv);

  const header: RatchetMessageHeader = {
    publicKey: state.ratchetPublicKey,
    counter: state.sendingMessageNumber,
    previousCounter: state.previousMessageNumber,
  };

  state.sendingMessageNumber++;

  return { header, ciphertext, iv, tag };
}

// ─── Message Decryption ─────────────────────────────────────────────────────

export async function ratchetDecrypt(
  state: RatchetState,
  message: RatchetMessage,
  tag: Uint8Array,
): Promise<Uint8Array> {
  const header = message.header;
  const remoteKeyHex = bytesToHex(header.publicKey);

  const isNewRatchetKey = !state.remoteRatchetPublicKey ||
    !equalBytes(state.remoteRatchetPublicKey, header.publicKey);

  if (isNewRatchetKey) {
    if (state.receivingChainKey) {
      state.receivingChains.set(
        remoteKeyHex,
        { chainKey: state.receivingChainKey, messageNumber: state.receivingMessageNumber },
      );
    }

    while (state.receivingChains.size > MAX_RECEIVING_CHAINS) {
      const firstKey = state.receivingChains.keys().next().value;
      if (firstKey) state.receivingChains.delete(firstKey);
    }

    const newChainKey = dhRatchet(state, header.publicKey);

    const keyPair = generateRatchetKeyPair();
    state.ratchetPublicKey = keyPair.publicKey;
    state.ratchetPrivateKey = keyPair.privateKey;
    state.previousMessageNumber = state.sendingMessageNumber;
    state.sendingMessageNumber = 0;
    state.sendingChainKey = newChainKey;

    state.remoteRatchetPublicKey = header.publicKey;
    state.receivingChainKey = newChainKey;
    state.receivingMessageNumber = 0;
  }

  const result = await tryDecryptWithChain(state, message, tag, header, remoteKeyHex);
  if (result) return result;

  const skipKey = state.skippedMessageKeys.get(getSkipKeyIdentifier(header));
  if (skipKey) {
    const decrypted = await aesGcmDecrypt(message.ciphertext, tag, skipKey, message.iv);
    state.skippedMessageKeys.delete(getSkipKeyIdentifier(header));
    return decrypted;
  }

  throw new Error('Failed to decrypt message: no matching chain key');
}

async function tryDecryptWithChain(
  state: RatchetState,
  message: RatchetMessage,
  tag: Uint8Array,
  header: RatchetMessageHeader,
  remoteKeyHex: string,
): Promise<Uint8Array | null> {
  const storedChain = state.receivingChains.get(remoteKeyHex);
  if (storedChain && header.counter < storedChain.messageNumber) {
    let chainKey = storedChain.chainKey;
    for (let i = 0; i <= header.counter; i++) {
      const { nextChainKey, messageKey } = ratchetChainKey(chainKey);
      chainKey = nextChainKey;
      if (i === header.counter) {
        return aesGcmDecrypt(message.ciphertext, tag, messageKey, message.iv);
      }
    }
  }

  if (!state.receivingChainKey) return null;

  if (header.counter === state.receivingMessageNumber) {
    const { nextChainKey, messageKey } = ratchetChainKey(state.receivingChainKey);
    state.receivingChainKey = nextChainKey;
    state.receivingMessageNumber++;
    return aesGcmDecrypt(message.ciphertext, tag, messageKey, message.iv);
  }

  if (header.counter > state.receivingMessageNumber) {
    let chainKey = state.receivingChainKey;
    for (let i = state.receivingMessageNumber; i < header.counter; i++) {
      const { nextChainKey, messageKey } = ratchetChainKey(chainKey);
      chainKey = nextChainKey;
      cacheSkippedMessageKey(state, { publicKey: header.publicKey, counter: i, previousCounter: header.previousCounter }, messageKey);
    }

    const { nextChainKey, messageKey } = ratchetChainKey(chainKey);
    state.receivingChainKey = nextChainKey;
    state.receivingMessageNumber = header.counter + 1;
    return aesGcmDecrypt(message.ciphertext, tag, messageKey, message.iv);
  }

  return null;
}

// ─── Skip Cache ─────────────────────────────────────────────────────────────

function getSkipKeyIdentifier(header: RatchetMessageHeader): string {
  return `${bytesToHex(header.publicKey)}:${header.counter}`;
}

function cacheSkippedMessageKey(
  state: RatchetState,
  header: RatchetMessageHeader,
  messageKey: Uint8Array,
): void {
  if (state.skippedMessageKeys.size >= MAX_SKIP_CACHE) {
    const firstKey = state.skippedMessageKeys.keys().next().value;
    if (firstKey) state.skippedMessageKeys.delete(firstKey);
  }
  state.skippedMessageKeys.set(getSkipKeyIdentifier(header), messageKey);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// ─── Serialization ───────────────────────────────────────────────────────────

export function serializeRatchetState(state: RatchetState): SerializedRatchetState {
  return {
    rootKey: bytesToHex(state.rootKey),
    sendingChainKey: state.sendingChainKey ? bytesToHex(state.sendingChainKey) : null,
    sendingMessageNumber: state.sendingMessageNumber,
    receivingChains: Array.from(state.receivingChains.entries()).map(
      ([key, val]) => [key, bytesToHex(val.chainKey), val.messageNumber],
    ),
    receivingChainKey: state.receivingChainKey ? bytesToHex(state.receivingChainKey) : null,
    receivingMessageNumber: state.receivingMessageNumber,
    ratchetPublicKey: bytesToHex(state.ratchetPublicKey),
    ratchetPrivateKey: state.ratchetPrivateKey ? bytesToHex(state.ratchetPrivateKey) : null,
    remoteRatchetPublicKey: state.remoteRatchetPublicKey
      ? bytesToHex(state.remoteRatchetPublicKey)
      : null,
    skippedMessageKeys: Array.from(state.skippedMessageKeys.entries()).map(
      ([key, val]) => [key, bytesToHex(val)],
    ),
    previousMessageNumber: state.previousMessageNumber,
  };
}

export function deserializeRatchetState(serialized: SerializedRatchetState): RatchetState {
  return {
    rootKey: hexToBytes(serialized.rootKey),
    sendingChainKey: serialized.sendingChainKey ? hexToBytes(serialized.sendingChainKey) : null,
    sendingMessageNumber: serialized.sendingMessageNumber,
    receivingChains: new Map(
      serialized.receivingChains.map(([key, chainKeyHex, msgNum]) => [
        key,
        { chainKey: hexToBytes(chainKeyHex), messageNumber: msgNum },
      ]),
    ),
    receivingChainKey: serialized.receivingChainKey
      ? hexToBytes(serialized.receivingChainKey)
      : null,
    receivingMessageNumber: serialized.receivingMessageNumber,
    ratchetPublicKey: hexToBytes(serialized.ratchetPublicKey),
    ratchetPrivateKey: serialized.ratchetPrivateKey
      ? hexToBytes(serialized.ratchetPrivateKey)
      : null,
    remoteRatchetPublicKey: serialized.remoteRatchetPublicKey
      ? hexToBytes(serialized.remoteRatchetPublicKey)
      : null,
    skippedMessageKeys: new Map(
      serialized.skippedMessageKeys.map(([key, valHex]) => [key, hexToBytes(valHex)]),
    ),
    previousMessageNumber: serialized.previousMessageNumber,
  };
}
