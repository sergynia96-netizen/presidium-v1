/**
 * E2E Crypto Module — Public API
 *
 * Import from here for all E2E operations:
 *
 *   import { sessionManager, messageProcessor, relayClient, useE2E } from '@/lib/crypto';
 */

// ─── Core Crypto ─────────────────────────────────────────────────────────────

export {
  generateIdentityKeyPair,
  derivePublicKey,
  serializeIdentityKeyPair,
  deserializeIdentityKeyPair,
  signWithIdentityKey,
  verifyWithIdentityKey,
  generateFingerprint,
  getShortFingerprint,
  type IdentityKeyPair,
  type SerializedIdentityKeyPair,
} from './identity';

export {
  generateX25519KeyPair,
  generateSignedPreKey,
  generateOneTimePreKeys,
  createPreKeyBundle,
  serializePreKeyBundle,
  deserializePreKeyBundle,
  verifySignedPreKey,
  PREKEY_COUNT,
  MAX_PREKEY_ID,
  type PreKeyPair,
  type SignedPreKeyPair,
  type PreKeyBundle,
  type LocalPreKeyBundle,
  type SerializedPreKeyBundle,
} from './prekeys';

export {
  ed25519ToX25519PublicKey,
  ed25519ToX25519PrivateKey,
  x25519DH,
  generateEphemeralKeys,
  x3dhInitiate,
  x3dhRespond,
  deriveX3DHSharedSecret,
  serializeX3DHInitiate,
  deserializeX3DHInitiate,
  type X3DHSharedSecret,
  type X3DHEphemeralKeys,
  type SerializedX3DHInitiate,
} from './x3dh';

export {
  generateRatchetKeyPair,
  initializeRatchet,
  ratchetEncrypt,
  ratchetDecrypt,
  serializeRatchetState,
  deserializeRatchetState,
  type RatchetState,
  type RatchetKeyPair,
  type RatchetMessageHeader,
  type RatchetMessage,
  type SerializedRatchetState,
} from './ratchet';

// ─── High-Level API ──────────────────────────────────────────────────────────

export {
  encryptMessage,
  decryptMessage,
  getOrCreateSession,
  establishResponderSession,
  getOrCreateIdentityKeys,
  getOrCreatePreKeys,
  getSession,
  setSession,
  deleteSession,
  getAllSessions,
  saveSessionsToStorage,
  loadSessionsFromStorage,
  cleanupStaleSessions as cleanupStaleSessionsEncrypt,
  type E2ESession,
  type EncryptedEnvelope,
  type DecryptedMessage,
} from './encrypt';

// ─── Session Manager ─────────────────────────────────────────────────────────

export {
  sessionManager,
  type SessionMetadata,
  type SessionCreateOptions,
  type SessionRestoreResult,
  type SessionStatus,
} from './session-manager';

// ─── Message Processor ───────────────────────────────────────────────────────

export {
  messageProcessor,
  type ProcessedMessage,
  type ModerationResult,
  type MessageProcessorOptions,
  type MessageDirection,
  type MessageStatus,
} from './message-processor';

// ─── Relay Client ────────────────────────────────────────────────────────────

export {
  relayClient,
  type RelayConfig,
  type RelayMessageEnvelope,
  type RelayAckMessage,
  type RelayTypingMessage,
  type RelayPresenceMessage,
  type RelayIncomingMessage,
  type RelayEvent,
  type RelayEventHandler,
} from './relay-client';

// ─── React Hook ──────────────────────────────────────────────────────────────

export {
  useE2E,
  type UseE2EReturn,
} from './use-e2e';

// ─── Fingerprint / Safety Numbers ────────────────────────────────────────────

export {
  generateSafetyNumbers,
  generateQRFingerprint,
  parseQRFingerprint,
  verifyIdentityKey,
  compareSafetyNumbers,
  generateVisualFingerprint,
  getTrustRecords,
  saveTrustRecord,
  isContactVerified,
  removeTrustRecord,
  type SafetyNumber,
  type VerificationResult,
  type TrustRecord,
} from './fingerprint';

// ─── Key Rotation ────────────────────────────────────────────────────────────

export {
  rotateSignedPreKey,
  isSignedPreKeyRotationDue,
  needsPreKeyReplenishment,
  replenishPreKeys,
  cleanupStaleSessions as cleanupStaleSessionsRotation,
  cleanupUserSessions,
  rotateIdentityKeys,
  checkAndRotateKeys,
  SIGNED_PREKEY_ROTATION_INTERVAL,
  MIN_ONE_TIME_PREKEYS,
  MAX_SESSION_AGE,
} from './rotation';

// ─── Group / Multi-Recipient Encryption ─────────────────────────────────────

export {
  generateSenderKey,
  groupEncrypt,
  groupDecrypt,
  type SenderKeyDistributionMessage,
  type SenderKeyState,
  type GroupEncryptedEnvelope,
} from './sender-key';

export {
  encryptForRecipients,
  decryptFromRecipientPacket,
  type MultiRecipientPacket,
} from './multi-recipient';

// ─── Storage (IndexedDB) ─────────────────────────────────────────────────────

export {
  getIdentityKeys,
  saveIdentityKeys,
  getPreKeyBundle,
  uploadPreKeyBundle,
  markPreKeyAsUsed,
  storeSession,
  loadSession,
  loadAllSessions,
  deleteSessionFromStorage,
  saveMessage,
  getMessage,
  getMessagesByChat,
  getMessagesBySender,
  deleteMessage,
  clearMessagesByChat,
  saveContact,
  getContact,
  getAllContacts as getAllContactsStorage,
  deleteContact,
  getSetting,
  saveSetting,
  clearAllData,
  exportAllData,
  importAllData,
  deleteDatabase,
  type StoredIdentityKeys,
  type StoredPreKeyBundle,
  type StoredSession,
  type StoredMessage,
  type StoredContact,
} from './store';

// ─── Utilities ───────────────────────────────────────────────────────────────

export {
  bytesToHex,
  hexToBytes,
  equalBytes,
  generateUUID,
  randomBytes,
  encodeText,
  decodeText,
  bytesToBase64,
  base64ToBytes,
} from './utils';
