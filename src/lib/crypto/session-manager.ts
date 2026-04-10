/**
 * E2E Session Manager
 *
 * Manages the complete lifecycle of E2E sessions:
 * - Session creation (X3DH handshake)
 * - Session persistence (IndexedDB)
 * - Session restoration (from storage)
 * - Session cleanup (stale, compromised)
 * - Session state tracking (established, pending, failed)
 * - Multi-device session management
 *
 * Architecture:
 * Each conversation has exactly ONE session per recipient device.
 * Sessions are created on first message and persist until explicitly destroyed.
 * Session state is synced to IndexedDB for crash recovery.
 */

import {
  getOrCreateIdentityKeys,
  getOrCreatePreKeys,
} from './encrypt';
import type { IdentityKeyPair } from './identity';
import type { PreKeyBundle, LocalPreKeyBundle } from './prekeys';
import {
  x3dhInitiate,
  x3dhRespond,
  generateEphemeralKeys,
} from './x3dh';
import type { SerializedX3DHInitiate } from './x3dh';
import {
  initializeRatchet,
  serializeRatchetState,
  deserializeRatchetState,
  type RatchetState,
} from './ratchet';
import {
  storeSession,
  loadAllSessions,
  deleteSessionFromStorage,
  type StoredSession,
  getContact,
  saveContact,
  type StoredContact,
} from './store';
import { bytesToHex, hexToBytes } from './utils';
import { relayClient } from './relay-client';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SessionStatus = 'pending' | 'established' | 'failed' | 'rotating';

export interface SessionMetadata {
  sessionId: string;
  recipientId: string;
  recipientDeviceId: string;
  status: SessionStatus;
  createdAt: number;
  lastUsedAt: number;
  lastRotatedAt: number;
  messageCount: number;
  failedAttempts: number;
  lastError: string | null;
}

export interface E2ESession {
  metadata: SessionMetadata;
  ratchetState: RatchetState;
  localIdentityKey: IdentityKeyPair;
  remoteIdentityKey: Uint8Array | null;
  remotePreKeyBundle: PreKeyBundle | null;
}

export interface SessionCreateOptions {
  forceRefresh?: boolean;
  skipPreKeyFetch?: boolean;
}

export interface SessionRestoreResult {
  restored: number;
  failed: number;
  sessions: Map<string, E2ESession>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FAILED_ATTEMPTS = 3;
const SESSION_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const AUTO_SAVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Session Store ───────────────────────────────────────────────────────────

class SessionManager {
  private sessions = new Map<string, E2ESession>();
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private isInitialized = false;
  private localIdentityKeys: IdentityKeyPair | null = null;
  private localPreKeys: LocalPreKeyBundle | null = null;

  // ─── Initialization ─────────────────────────────────────────────────────

  /**
   * Initialize the session manager.
   * Must be called before any other method.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Load or create local identity keys
    this.localIdentityKeys = await getOrCreateIdentityKeys();

    // Load or create pre-key bundles
    this.localPreKeys = await getOrCreatePreKeys();

    // Restore sessions from IndexedDB
    await this.restoreSessions();

    // Start auto-save timer
    this.startAutoSave();

    this.isInitialized = true;

    console.log(`[E2E SessionManager] Initialized: ${this.sessions.size} sessions restored`);
  }

  /**
   * Restore all sessions from IndexedDB.
   */
  async restoreSessions(): Promise<SessionRestoreResult> {
    const stored = await loadAllSessions();
    const result: SessionRestoreResult = {
      restored: 0,
      failed: 0,
      sessions: new Map(),
    };

    if (!this.localIdentityKeys) {
      throw new Error('SessionManager not initialized. Call initialize() first.');
    }

    for (const [recipientId, storedSession] of stored) {
      try {
        const session = this.reconstructSession(recipientId, storedSession);
        this.sessions.set(recipientId, session);
        result.sessions.set(recipientId, session);
        result.restored++;
      } catch (error) {
        console.error(`[E2E SessionManager] Failed to restore session for ${recipientId}:`, error);
        result.failed++;
        // Delete corrupted session
        await deleteSessionFromStorage(recipientId);
      }
    }

    return result;
  }

  /**
   * Reconstruct a session from stored data.
   */
  private reconstructSession(recipientId: string, stored: StoredSession): E2ESession {
    const ratchetState = deserializeRatchetState(
      stored.ratchetState as ReturnType<typeof serializeRatchetState>,
    );

    return {
      metadata: {
        sessionId: `session-${recipientId}-${stored.createdAt}`,
        recipientId,
        recipientDeviceId: 'web', // TODO: Multi-device
        status: stored.isEstablished ? 'established' : 'pending',
        createdAt: stored.createdAt,
        lastUsedAt: stored.lastUsedAt,
        lastRotatedAt: stored.lastUsedAt, // Approximation
        messageCount: ratchetState.sendingMessageNumber + ratchetState.receivingMessageNumber,
        failedAttempts: 0,
        lastError: null,
      },
      ratchetState,
      localIdentityKey: this.localIdentityKeys!,
      remoteIdentityKey: null, // Will be fetched on demand
      remotePreKeyBundle: null, // Will be fetched on demand
    };
  }

  // ─── Session Lifecycle ──────────────────────────────────────────────────

  /**
   * Get or create a session for a recipient.
   * If session exists and is established, returns it.
   * If session exists but is stale/failed, recreates it.
   * If no session exists, creates a new one via X3DH.
   */
  async getOrCreateSession(
    recipientId: string,
    options: SessionCreateOptions = {},
  ): Promise<E2ESession> {
    this.ensureInitialized();

    const existing = this.sessions.get(recipientId);

    // Check if existing session is usable
    if (existing && this.isSessionUsable(existing, options)) {
      existing.metadata.lastUsedAt = Date.now();
      await this.saveSession(recipientId);
      return existing;
    }

    // Create new session
    return this.createSession(recipientId);
  }

  /**
   * Check if an existing session is still usable.
   */
  private isSessionUsable(session: E2ESession, options: SessionCreateOptions): boolean {
    // Force refresh requested
    if (options.forceRefresh) return false;

    // Session not established
    if (session.metadata.status !== 'established') return false;

    // Too many failed attempts
    if (session.metadata.failedAttempts >= MAX_FAILED_ATTEMPTS) return false;

    // Session expired
    if (Date.now() - session.metadata.lastUsedAt > SESSION_TIMEOUT_MS) return false;

    return true;
  }

  /**
   * Create a new E2E session with a recipient.
   * Performs X3DH key exchange.
   */
  private async createSession(recipientId: string): Promise<E2ESession> {
    if (!this.localIdentityKeys || !this.localPreKeys) {
      throw new Error('Local keys not available');
    }

    // Fetch recipient's pre-key bundle from relay
    const remoteBundle = await this.fetchRemotePreKeyBundle(recipientId);
    if (!remoteBundle) {
      throw new Error(`No pre-key bundle available for ${recipientId}`);
    }

    // Generate ephemeral keys for X3DH
    const ephemeralKeys = generateEphemeralKeys();

    // Perform X3DH key exchange
    const sharedSecret = x3dhInitiate(
      this.localIdentityKeys,
      remoteBundle,
      ephemeralKeys,
    );

    // Initialize Double Ratchet (we are the initiator)
    const ratchetState = initializeRatchet(sharedSecret.sharedSecret, true);

    // Create session object
    const session: E2ESession = {
      metadata: {
        sessionId: `session-${recipientId}-${Date.now()}`,
        recipientId,
        recipientDeviceId: 'web',
        status: 'established',
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        lastRotatedAt: Date.now(),
        messageCount: 0,
        failedAttempts: 0,
        lastError: null,
      },
      ratchetState,
      localIdentityKey: this.localIdentityKeys,
      remoteIdentityKey: remoteBundle.identityKey,
      remotePreKeyBundle: remoteBundle,
    };

    // Store session
    this.sessions.set(recipientId, session);
    await this.saveSession(recipientId);

    // Update contact with remote identity key
    await this.updateContactIdentityKey(recipientId, remoteBundle.identityKey);

    console.log(`[E2E SessionManager] Session created for ${recipientId}`);
    return session;
  }

  /**
   * Establish a session as the responder (when receiving first message).
   */
  async establishResponderSession(
    senderId: string,
    x3dhData: SerializedX3DHInitiate,
  ): Promise<E2ESession> {
    this.ensureInitialized();

    const existing = this.sessions.get(senderId);
    if (existing && existing.metadata.status === 'established') {
      existing.metadata.lastUsedAt = Date.now();
      return existing;
    }

    if (!this.localIdentityKeys || !this.localPreKeys) {
      throw new Error('Local keys not available');
    }

    // Find the one-time pre-key that was used
    const usedOpk = x3dhData.oneTimePreKeyId !== undefined
      ? this.localPreKeys!.oneTimePreKeys.find((k: { keyId: number }) => k.keyId === x3dhData.oneTimePreKeyId) || null
      : null;

    // Perform X3DH as responder
    const sharedSecret = x3dhRespond(
      this.localIdentityKeys!,
      this.localPreKeys!.signedPreKey,
      usedOpk,
      hexToBytes(x3dhData.identityKey),
      hexToBytes(x3dhData.ephemeralKey),
    );

    // Initialize Double Ratchet (we are NOT the initiator)
    const ratchetState = initializeRatchet(sharedSecret.sharedSecret, false);
    ratchetState.remoteRatchetPublicKey = hexToBytes(x3dhData.ephemeralKey);

    const session: E2ESession = {
      metadata: {
        sessionId: `session-${senderId}-${Date.now()}`,
        recipientId: senderId,
        recipientDeviceId: 'web',
        status: 'established',
        createdAt: Date.now(),
        lastUsedAt: Date.now(),
        lastRotatedAt: Date.now(),
        messageCount: 0,
        failedAttempts: 0,
        lastError: null,
      },
      ratchetState,
      localIdentityKey: this.localIdentityKeys,
      remoteIdentityKey: hexToBytes(x3dhData.identityKey),
      remotePreKeyBundle: null,
    };

    this.sessions.set(senderId, session);
    await this.saveSession(senderId);

    // Update contact
    await this.updateContactIdentityKey(senderId, hexToBytes(x3dhData.identityKey));

    console.log(`[E2E SessionManager] Responder session established for ${senderId}`);
    return session;
  }

  /**
   * Get an existing session without creating a new one.
   */
  getSession(recipientId: string): E2ESession | undefined {
    return this.sessions.get(recipientId);
  }

  /**
   * Get all active sessions.
   */
  getAllSessions(): Map<string, E2ESession> {
    return new Map(this.sessions);
  }

  /**
   * Delete a session.
   */
  async deleteSession(recipientId: string): Promise<void> {
    this.sessions.delete(recipientId);
    await deleteSessionFromStorage(recipientId);
    console.log(`[E2E SessionManager] Session deleted for ${recipientId}`);
  }

  /**
   * Delete all sessions (for logout/account deletion).
   */
  async deleteAllSessions(): Promise<void> {
    const recipientIds = Array.from(this.sessions.keys());
    for (const id of recipientIds) {
      await this.deleteSession(id);
    }
    this.sessions.clear();
  }

  // ─── Session Persistence ────────────────────────────────────────────────

  /**
   * Save a single session to IndexedDB.
   */
  private async saveSession(recipientId: string): Promise<void> {
    const session = this.sessions.get(recipientId);
    if (!session) return;

    const stored: StoredSession = {
      ratchetState: serializeRatchetState(session.ratchetState),
      isEstablished: session.metadata.status === 'established',
      createdAt: session.metadata.createdAt,
      lastUsedAt: session.metadata.lastUsedAt,
    };

    await storeSession(recipientId, stored);
  }

  /**
   * Save all sessions to IndexedDB.
   */
  async saveAllSessions(): Promise<void> {
    const savePromises = Array.from(this.sessions.keys()).map(id => this.saveSession(id));
    await Promise.all(savePromises);
  }

  /**
   * Start auto-save timer.
   */
  private startAutoSave(): void {
    if (this.autoSaveTimer) return;

    this.autoSaveTimer = setInterval(async () => {
      try {
        await this.saveAllSessions();
      } catch (error) {
        console.error('[E2E SessionManager] Auto-save failed:', error);
      }
    }, AUTO_SAVE_INTERVAL_MS);
  }

  /**
   * Stop auto-save timer.
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // ─── Session Maintenance ────────────────────────────────────────────────

  /**
   * Clean up stale sessions.
   */
  async cleanupStaleSessions(maxAgeMs = SESSION_TIMEOUT_MS): Promise<string[]> {
    const removed: string[] = [];
    const now = Date.now();

    for (const [recipientId, session] of this.sessions) {
      if (now - session.metadata.lastUsedAt > maxAgeMs) {
        await this.deleteSession(recipientId);
        removed.push(recipientId);
      }
    }

    if (removed.length > 0) {
      console.log(`[E2E SessionManager] Cleaned up ${removed.length} stale sessions`);
    }

    return removed;
  }

  /**
   * Record a failed attempt for a session.
   */
  async recordFailure(recipientId: string, error: string): Promise<void> {
    const session = this.sessions.get(recipientId);
    if (!session) return;

    session.metadata.failedAttempts++;
    session.metadata.lastError = error;
    session.metadata.lastUsedAt = Date.now();

    if (session.metadata.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      session.metadata.status = 'failed';
      console.warn(`[E2E SessionManager] Session failed for ${recipientId}: ${error}`);
    }

    await this.saveSession(recipientId);
  }

  /**
   * Record a successful message send/receive.
   */
  async recordSuccess(recipientId: string): Promise<void> {
    const session = this.sessions.get(recipientId);
    if (!session) return;

    session.metadata.messageCount++;
    session.metadata.failedAttempts = 0;
    session.metadata.lastError = null;
    session.metadata.lastUsedAt = Date.now();

    await this.saveSession(recipientId);
  }

  // ─── Contact Management ─────────────────────────────────────────────────

  /**
   * Update a contact's identity key.
   */
  private async updateContactIdentityKey(
    contactId: string,
    identityKey: Uint8Array,
  ): Promise<void> {
    const existing = await getContact(contactId);

    const contact: StoredContact = {
      id: contactId,
      name: existing?.name || contactId,
      identityKey: bytesToHex(identityKey),
      fingerprint: '',
      isVerified: existing?.isVerified || false,
      lastSeen: Date.now(),
    };

    await saveContact(contact);
  }

  // ─── Relay Integration ──────────────────────────────────────────────────

  /**
   * Fetch a remote user's pre-key bundle from the relay.
   */
  private async fetchRemotePreKeyBundle(recipientId: string): Promise<PreKeyBundle | null> {
    try {
      return await relayClient.fetchPreKeyBundle(recipientId);
    } catch (error) {
      console.error(`[E2E SessionManager] Failed to fetch pre-key bundle for ${recipientId}:`, error);
      return null;
    }
  }

  // ─── Utility ────────────────────────────────────────────────────────────

  private ensureInitialized(): void {
    if (!this.isInitialized) {
      throw new Error('SessionManager not initialized. Call initialize() first.');
    }
  }

  /**
   * Get local identity keys (for external use).
   */
  getLocalIdentityKeys(): IdentityKeyPair | null {
    return this.localIdentityKeys;
  }

  /**
   * Get local pre-key bundle (for external use).
   */
  getLocalPreKeys(): LocalPreKeyBundle | null {
    return this.localPreKeys;
  }

  /**
   * Check if session manager is initialized.
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get session statistics.
   */
  getStats(): {
    totalSessions: number;
    establishedSessions: number;
    failedSessions: number;
    pendingSessions: number;
  } {
    let established = 0;
    let failed = 0;
    let pending = 0;

    for (const session of this.sessions.values()) {
      switch (session.metadata.status) {
        case 'established': established++; break;
        case 'failed': failed++; break;
        case 'pending': pending++; break;
      }
    }

    return {
      totalSessions: this.sessions.size,
      establishedSessions: established,
      failedSessions: failed,
      pendingSessions: pending,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const sessionManager = new SessionManager();
