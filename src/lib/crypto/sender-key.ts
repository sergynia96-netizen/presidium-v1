/**
 * Signal Sender Key Algorithm (Group E2E Encryption)
 * 
 * Provides efficient O(1) multicast encryption for groups.
 * - Sender Key generation (Chain Key + Signature Key)
 * - Message Key derivation
 * - Distribution via 1:1 Double Ratchet
 */

import { randomBytes, encodeText, decodeText } from './utils';

// Core Types
export interface SenderKeyDistributionMessage {
  groupId: string;
  senderId: string;
  chainKey: Uint8Array;    // 32 bytes
  publicSignatureKey: CryptoKey; // Ed25519/ECDSA public key
  iteration: number;
}

export interface SenderKeyState {
  groupId: string;
  senderId: string;
  chainKey: Uint8Array;
  iteration: number;
  publicSignatureKey: CryptoKey;
  privateSignatureKey?: CryptoKey; // Only present for our own sender key
}

export interface GroupEncryptedEnvelope {
  groupId: string;
  senderId: string;
  iteration: number;
  ciphertext: Uint8Array;
  signature: Uint8Array;
}

// Key Derivation Constants
const MESSAGE_KEY_SEED = new Uint8Array([0x01]);
const CHAIN_KEY_SEED = new Uint8Array([0x02]);

function getSubtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SubtleCrypto is not available in this environment');
  }
  return globalThis.crypto.subtle;
}

/**
 * Generate a new Sender Key state for a group.
 */
export async function generateSenderKey(groupId: string, senderId: string): Promise<SenderKeyState> {
  const chainKey = randomBytes(32);
  const subtle = getSubtle();
  
  // Generate ECDSA signing key pair for authenticity
  const keyPair = await subtle.generateKey(
    {
      name: "ECDSA",
      namedCurve: "P-256"
    },
    true,
    ["sign", "verify"]
  );

  return {
    groupId,
    senderId,
    chainKey,
    iteration: 0,
    publicSignatureKey: keyPair.publicKey,
    privateSignatureKey: keyPair.privateKey
  };
}

/**
 * Derive the next chain key and current message key using HMAC-SHA256.
 */
async function advanceChain(chainKey: Uint8Array): Promise<{ nextChainKey: Uint8Array; messageKey: Uint8Array }> {
  const subtle = getSubtle();
  const key = await subtle.importKey(
    'raw',
    chainKey.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const messageKeyBuf = await subtle.sign('HMAC', key, MESSAGE_KEY_SEED);
  const nextChainKeyBuf = await subtle.sign('HMAC', key, CHAIN_KEY_SEED);

  return {
    messageKey: new Uint8Array(messageKeyBuf),
    nextChainKey: new Uint8Array(nextChainKeyBuf)
  };
}

/**
 * Encrypt a plaintext message for a group using the current Sender Key.
 * Updates the sender key state (advances iteration).
 */
export async function groupEncrypt(plaintext: string, state: SenderKeyState): Promise<{ envelope: GroupEncryptedEnvelope, newState: SenderKeyState }> {
  if (!state.privateSignatureKey) {
    throw new Error('Cannot encrypt: missing private signature key. Are you the owner of this sender key?');
  }
  const subtle = getSubtle();

  // Derive keys
  const { messageKey, nextChainKey } = await advanceChain(state.chainKey);
  const currentIteration = state.iteration;

  // Derive AES-GCM Key from messageKey
  const aesKey = await subtle.importKey(
    'raw',
    messageKey.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  // Encrypt with AES-GCM
  const iv = randomBytes(12);
  const encodedContent = encodeText(plaintext);
  const ciphertextBuf = await subtle.encrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    aesKey,
    encodedContent.buffer as ArrayBuffer
  );

  // Prepend IV to ciphertext
  const finalCiphertext = new Uint8Array(iv.length + ciphertextBuf.byteLength);
  finalCiphertext.set(iv, 0);
  finalCiphertext.set(new Uint8Array(ciphertextBuf), iv.length);

  // Sign the ciphertext and iteration
  const payloadToSign = new Uint8Array(finalCiphertext.length + 4);
  payloadToSign.set(finalCiphertext, 0);
  new DataView(payloadToSign.buffer).setUint32(finalCiphertext.length, currentIteration, littleEndian);

  const signatureBuf = await subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    state.privateSignatureKey,
    payloadToSign
  );

  const envelope: GroupEncryptedEnvelope = {
    groupId: state.groupId,
    senderId: state.senderId,
    iteration: currentIteration,
    ciphertext: finalCiphertext,
    signature: new Uint8Array(signatureBuf)
  };

  const newState: SenderKeyState = {
    ...state,
    chainKey: nextChainKey,
    iteration: currentIteration + 1
  };

  return { envelope, newState };
}

/**
 * Decrypt a group message using the stored Sender Key state for that sender.
 * Advances the locally cached chain if necessary.
 */
export async function groupDecrypt(envelope: GroupEncryptedEnvelope, state: SenderKeyState): Promise<{ plaintext: string, newState: SenderKeyState }> {
  const subtle = getSubtle();
  // 1. Roll chain forward if we missed messages
  let currentChainKey = state.chainKey;
  let currentIteration = state.iteration;
  
  if (envelope.iteration < currentIteration) {
    throw new Error('Message is from the past. Missing message key caching is not fully implemented in MVP.');
  }

  // Catch up to the iteration of the incoming message
  let messageKey: Uint8Array | null = null;
  while (currentIteration <= envelope.iteration) {
    const derived = await advanceChain(currentChainKey);
    if (currentIteration === envelope.iteration) {
      messageKey = derived.messageKey;
    }
    currentChainKey = derived.nextChainKey;
    currentIteration++;
  }

  if (!messageKey) {
    throw new Error('Failed to derive group message key');
  }

  // 2. Verify signature
  const payloadToVerify = new Uint8Array(envelope.ciphertext.length + 4);
  payloadToVerify.set(envelope.ciphertext, 0);
  new DataView(payloadToVerify.buffer).setUint32(envelope.ciphertext.length, envelope.iteration, littleEndian);

  const isValid = await subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    state.publicSignatureKey,
    envelope.signature.buffer as ArrayBuffer,
    payloadToVerify.buffer as ArrayBuffer
  );

  if (!isValid) {
    throw new Error('Group message signature verification failed. Message may have been tampered with or sender key is invalid.');
  }

  // 3. Decrypt
  const iv = envelope.ciphertext.slice(0, 12);
  const actualCiphertext = envelope.ciphertext.slice(12);

  const aesKey = await subtle.importKey(
    'raw',
    messageKey.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const plaintextBuf = await subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    aesKey,
    actualCiphertext.buffer as ArrayBuffer
  );

  const plaintext = decodeText(new Uint8Array(plaintextBuf));

  const newState: SenderKeyState = {
    ...state,
    chainKey: currentChainKey,
    iteration: currentIteration
  };

  return { plaintext, newState };
}

const littleEndian = true;
