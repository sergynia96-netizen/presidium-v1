/**
 * IndexedDB Storage Layer for E2E Crypto
 *
 * Stores: identity keys, pre-keys, sessions, encrypted messages, contacts, settings.
 * All data is stored client-side only. The server never sees plaintext.
 */

import { hexToBytes, bytesToHex } from './utils';
import { KeyVault, type EncryptedPrivateKeyPayload } from './vault';

const DB_NAME = 'presidium-crypto-db';
const DB_VERSION = 1;

const STORES = {
  IDENTITY_KEYS: 'identity-keys',
  PRE_KEYS: 'pre-keys',
  SESSIONS: 'sessions',
  MESSAGES: 'messages',
  CONTACTS: 'contacts',
  SETTINGS: 'settings',
} as const;

type StoreName = typeof STORES[keyof typeof STORES];

const IDENTITY_LEGACY_KEY = 'identity';
const IDENTITY_ENCRYPTED_KEY = 'identity_encrypted';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORES.IDENTITY_KEYS)) {
        db.createObjectStore(STORES.IDENTITY_KEYS);
      }
      if (!db.objectStoreNames.contains(STORES.PRE_KEYS)) {
        db.createObjectStore(STORES.PRE_KEYS);
      }
      if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
        db.createObjectStore(STORES.SESSIONS);
      }
      if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
        const msgStore = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id' });
        msgStore.createIndex('byChat', 'chatId', { unique: false });
        msgStore.createIndex('bySender', 'senderId', { unique: false });
        msgStore.createIndex('byTimestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.CONTACTS)) {
        db.createObjectStore(STORES.CONTACTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS);
      }
    };
  });

  return dbPromise;
}

// ─── Generic CRUD ────────────────────────────────────────────────────────────

async function get<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function put<T>(storeName: StoreName, key: IDBValidKey, value: T): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function remove(storeName: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getAll<T>(storeName: StoreName): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Identity Keys ───────────────────────────────────────────────────────────

export interface StoredIdentityKeys {
  publicKey: string;
  privateKey: string;
}

export interface StoredEncryptedIdentityKeys {
  publicKey: string;
  encryptedPrivateKey: EncryptedPrivateKeyPayload;
  createdAt: number;
}

function resolveVaultPassword(password?: string): string | undefined {
  if (password && password.trim()) return password.trim();
  const fromVault = KeyVault.getVaultPassword();
  return fromVault || undefined;
}

export async function getIdentityKeys(password?: string): Promise<StoredIdentityKeys | undefined> {
  const encrypted = await get<StoredEncryptedIdentityKeys>(STORES.IDENTITY_KEYS, IDENTITY_ENCRYPTED_KEY);
  const vaultPassword = resolveVaultPassword(password);

  if (encrypted) {
    if (!vaultPassword) {
      throw new Error('Password required to decrypt identity keys');
    }

    const privateKeyBytes = await KeyVault.decryptPrivateKey(
      encrypted.encryptedPrivateKey.encrypted,
      encrypted.encryptedPrivateKey.salt,
      encrypted.encryptedPrivateKey.iv,
      vaultPassword,
    );

    return {
      publicKey: encrypted.publicKey,
      privateKey: bytesToHex(privateKeyBytes),
    };
  }

  const legacy = await get<StoredIdentityKeys>(STORES.IDENTITY_KEYS, IDENTITY_LEGACY_KEY);
  if (legacy && vaultPassword) {
    // Automatic migration from plaintext to encrypted-at-rest storage.
    await saveIdentityKeys(legacy, vaultPassword);
  }

  return legacy;
}

export async function saveIdentityKeys(keys: StoredIdentityKeys, password?: string): Promise<void> {
  const vaultPassword = resolveVaultPassword(password);

  if (vaultPassword) {
    const encryptedPrivateKey = await KeyVault.encryptPrivateKey(
      hexToBytes(keys.privateKey),
      vaultPassword,
    );

    await put<StoredEncryptedIdentityKeys>(STORES.IDENTITY_KEYS, IDENTITY_ENCRYPTED_KEY, {
      publicKey: keys.publicKey,
      encryptedPrivateKey,
      createdAt: Date.now(),
    });

    // Remove legacy plaintext key after successful encrypted write.
    await remove(STORES.IDENTITY_KEYS, IDENTITY_LEGACY_KEY);
    return;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('Password required for identity keys in production');
  }

  await put(STORES.IDENTITY_KEYS, IDENTITY_LEGACY_KEY, keys);
}

// ─── Pre-Keys ────────────────────────────────────────────────────────────────

export interface StoredPreKeyBundle {
  identityKey: string;
  signedPreKey: { keyId: number; publicKey: string; signature: string };
  oneTimePreKeys: { keyId: number; publicKey: string }[];
  usedKeyIds: number[];
}

export async function getPreKeyBundle(type: 'identity' | 'prekeys', password?: string) {
  if (type === 'identity') {
    return getIdentityKeys(password);
  }
  return get<StoredPreKeyBundle>(STORES.PRE_KEYS, 'prekeys');
}

export async function uploadPreKeyBundle(
  type: 'identity' | 'prekeys',
  data: unknown,
  password?: string,
): Promise<void> {
  if (type === 'identity') {
    return saveIdentityKeys(data as StoredIdentityKeys, password);
  }
  return put(STORES.PRE_KEYS, 'prekeys', data as StoredPreKeyBundle);
}

export async function markPreKeyAsUsed(_recipientId: string, keyId: number): Promise<void> {
  const bundle = await get<StoredPreKeyBundle>(STORES.PRE_KEYS, 'prekeys');
  if (!bundle) return;

  if (!bundle.usedKeyIds) bundle.usedKeyIds = [];
  bundle.usedKeyIds.push(keyId);
  bundle.oneTimePreKeys = bundle.oneTimePreKeys.filter(k => k.keyId !== keyId);

  return put(STORES.PRE_KEYS, 'prekeys', bundle);
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export interface StoredSession {
  ratchetState: unknown;
  isEstablished: boolean;
  createdAt: number;
  lastUsedAt: number;
}

export async function storeSession(recipientId: string, session: StoredSession): Promise<void> {
  return put(STORES.SESSIONS, recipientId, session);
}

export async function loadSession(recipientId: string): Promise<StoredSession | undefined> {
  return get(STORES.SESSIONS, recipientId);
}

export async function loadAllSessions(): Promise<Map<string, StoredSession>> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SESSIONS, 'readonly');
    const store = tx.objectStore(STORES.SESSIONS);
    const request = store.openCursor();
    const map = new Map<string, StoredSession>();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (cursor) {
        map.set(cursor.key as string, cursor.value as StoredSession);
        cursor.continue();
      } else {
        resolve(map);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSessionFromStorage(recipientId: string): Promise<void> {
  return remove(STORES.SESSIONS, recipientId);
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface StoredMessage {
  id: string;
  chatId: string;
  senderId: string;
  recipientId: string;
  encrypted: string;
  timestamp: number;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  direction: 'outgoing' | 'incoming';
}

export async function saveMessage(message: StoredMessage): Promise<void> {
  return put(STORES.MESSAGES, message.id, message);
}

export async function getMessage(messageId: string): Promise<StoredMessage | undefined> {
  return get(STORES.MESSAGES, messageId);
}

export async function getMessagesByChat(chatId: string): Promise<StoredMessage[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.MESSAGES, 'readonly');
    const store = tx.objectStore(STORES.MESSAGES);
    const index = store.index('byChat');
    const request = index.getAll(chatId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getMessagesBySender(senderId: string): Promise<StoredMessage[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.MESSAGES, 'readonly');
    const store = tx.objectStore(STORES.MESSAGES);
    const index = store.index('bySender');
    const request = index.getAll(senderId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteMessage(messageId: string): Promise<void> {
  return remove(STORES.MESSAGES, messageId);
}

export async function clearMessagesByChat(chatId: string): Promise<void> {
  const messages = await getMessagesByChat(chatId);
  for (const msg of messages) {
    await deleteMessage(msg.id);
  }
}

// ─── Contacts ────────────────────────────────────────────────────────────────

export interface StoredContact {
  id: string;
  name: string;
  identityKey: string;
  fingerprint: string;
  isVerified: boolean;
  lastSeen: number;
}

export async function saveContact(contact: StoredContact): Promise<void> {
  return put(STORES.CONTACTS, contact.id, contact);
}

export async function getContact(contactId: string): Promise<StoredContact | undefined> {
  return get(STORES.CONTACTS, contactId);
}

export async function getAllContacts(): Promise<StoredContact[]> {
  return getAll(STORES.CONTACTS);
}

export async function deleteContact(contactId: string): Promise<void> {
  return remove(STORES.CONTACTS, contactId);
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return get<T>(STORES.SETTINGS, key);
}

export async function saveSetting<T>(key: string, value: T): Promise<void> {
  return put(STORES.SETTINGS, key, value);
}

// ─── Database Management ─────────────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  const db = await openDatabase();
  const storeNames = Object.values(STORES) as StoreName[];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    let completed = 0;

    for (const storeName of storeNames) {
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => {
        completed++;
        if (completed === storeNames.length) resolve();
      };
      request.onerror = () => reject(request.error);
    }
  });
}

export async function exportAllData(): Promise<Record<string, unknown[]>> {
  const result: Record<string, unknown[]> = {};
  const storeNames = Object.values(STORES) as StoreName[];

  for (const storeName of storeNames) {
    result[storeName] = await getAll(storeName);
  }

  return result;
}

export async function importAllData(data: Record<string, unknown[]>): Promise<void> {
  const db = await openDatabase();
  const storeNames = Object.keys(data) as StoreName[];

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    let completed = 0;

    for (const storeName of storeNames) {
      const store = tx.objectStore(storeName);
      for (const value of data[storeName]) {
        store.put(value);
      }
      completed++;
      if (completed === storeNames.length) resolve();
    }

    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => {
      dbPromise = null;
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}
