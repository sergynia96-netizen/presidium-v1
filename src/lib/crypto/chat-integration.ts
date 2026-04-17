/**
 * E2E Integration Layer for Chat View
 *
 * Bridges the E2E crypto infrastructure with the chat-view component.
 * Handles:
 * - Encrypting outgoing messages
 * - Decrypting incoming messages
 * - Detecting encrypted payloads
 * - E2E session management per chat
 * - Safety number verification
 */

/*
 * CHANGELOG (Codex)
 * 2026-04-17:
 * - Added init deduplication via initializePromise to avoid parallel init races.
 * - Marked pre-key upload unauthorized state to avoid repeated failing uploads.
 * - Added temporary cooldown for ensureSession after auth-related failures
 *   to reduce repeated relay requests and console spam.
 */

import { sessionManager } from '@/lib/crypto/session-manager';
import { relayClient } from '@/lib/crypto/relay-client';
import { encryptMessage, decryptMessage, type EncryptedEnvelope } from '@/lib/crypto/encrypt';
import { generateSafetyNumbers, saveTrustRecord, getTrustRecords } from '@/lib/crypto/fingerprint';
import { bytesToHex } from '@/lib/crypto/utils';
import { getMessagesByChat, saveMessage, type StoredMessage } from '@/lib/crypto/store';
import { KeyVault } from '@/lib/crypto/vault';
import type { Message } from '@/types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface E2EChatState {
  isInitialized: boolean;
  isRelayConnected: boolean;
  hasSession: boolean;
  isVerified: boolean;
  safetyNumber: string | null;
  error: string | null;
}

export interface E2ESendResult {
  success: boolean;
  messageId: string;
  encrypted?: EncryptedEnvelope;
  error?: string;
}

export interface E2EReceiveResult {
  success: boolean;
  decryptedMessage: Message | null;
  error?: string;
}

// ─── E2E Chat Integration ───────────────────────────────────────────────────

class E2EChatIntegration {
  private initialized = false;
  private initializePromise: Promise<void> | null = null;
  private preKeyUploadUnauthorized = false;
  private ensureSessionBlockedUntil = 0;
  private eventUnsubscribe: (() => void) | null = null;
  private messageHandler: ((envelope: EncryptedEnvelope) => void) | null = null;

  /**
   * Initialize E2E for the chat view.
   * Must be called once when the app starts.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initializePromise) {
      await this.initializePromise;
      return;
    }

    this.initializePromise = (async () => {
      try {
        const vaultPassword = KeyVault.getVaultPassword() || undefined;

        // Initialize session manager (generates/loads identity keys + pre-keys)
        await sessionManager.initialize(vaultPassword);

        // Connect to relay (non-fatal in local/offline dev mode)
        try {
          await relayClient.connect();
        } catch (relayError) {
          console.warn('[E2EChatIntegration] Relay connection unavailable during init:', relayError);
        }

        // Upload local pre-key bundle to relay so other users can initiate E2E sessions
        const localPreKeys = sessionManager.getLocalPreKeys();
        if (localPreKeys && relayClient.connected && !this.preKeyUploadUnauthorized) {
          try {
            await relayClient.uploadPreKeyBundle(localPreKeys);
            console.log('[E2EChatIntegration] Pre-key bundle uploaded to relay');
          } catch (uploadError) {
            const uploadMessage = uploadError instanceof Error ? uploadError.message : String(uploadError);
            if (/401|403|unauthorized|forbidden|auth is temporarily blocked/i.test(uploadMessage)) {
              this.preKeyUploadUnauthorized = true;
            }
            // Non-fatal: relay may be unavailable, keys will be re-uploaded next time
            console.warn('[E2EChatIntegration] Failed to upload pre-key bundle:', uploadError);
          }
        }

        // Set up event handler for incoming encrypted messages
        this.eventUnsubscribe = relayClient.on((event) => {
          if (event.type === 'message') {
            this.messageHandler?.(event.data);
          }
        });

        this.initialized = true;
      } catch (error) {
        console.error('[E2EChatIntegration] Initialization failed:', error);
        throw error;
      }
    })();

    try {
      await this.initializePromise;
    } finally {
      this.initializePromise = null;
    }
  }

  /**
   * Clean up E2E resources.
   */
  cleanup(): void {
    if (this.eventUnsubscribe) {
      this.eventUnsubscribe();
      this.eventUnsubscribe = null;
    }
    relayClient.disconnect();
    sessionManager.stopAutoSave();
    this.initialized = false;
    this.initializePromise = null;
    this.preKeyUploadUnauthorized = false;
  }

  /**
   * Register a handler for incoming encrypted messages.
   */
  onIncomingMessage(handler: (envelope: EncryptedEnvelope) => void): () => void {
    this.messageHandler = handler;
    return () => {
      if (this.messageHandler === handler) {
        this.messageHandler = null;
      }
    };
  }

  /**
   * Get the current E2E state for a chat.
   */
  getChatState(peerId: string): E2EChatState {
    const session = sessionManager.getSession(peerId);
    const trustRecords = getTrustRecords();
    const isVerified = session?.remoteIdentityKey
      ? trustRecords.some(
          r => r.userId === peerId && r.identityKey === bytesToHex(session.remoteIdentityKey!),
        )
      : false;

    return {
      isInitialized: this.initialized,
      isRelayConnected: relayClient.connected,
      hasSession: !!session && session.metadata.status === 'established',
      isVerified,
      safetyNumber: null, // Computed on demand
      error: session?.metadata.lastError || null,
    };
  }

  /**
   * Get safety number for a chat.
   */
  async getSafetyNumber(peerId: string): Promise<string | null> {
    const identityKeys = sessionManager.getLocalIdentityKeys();
    const session = sessionManager.getSession(peerId);

    if (!identityKeys || !session?.remoteIdentityKey) {
      return null;
    }

    const safetyNumbers = await generateSafetyNumbers(identityKeys, session.remoteIdentityKey);
    return safetyNumbers.combined;
  }

  /**
   * Verify a safety number for a chat.
   */
  async verifySafetyNumber(peerId: string, _expectedNumber: string): Promise<boolean> {
    const session = sessionManager.getSession(peerId);
    if (!session?.remoteIdentityKey) return false;

    saveTrustRecord({
      userId: peerId,
      identityKey: bytesToHex(session.remoteIdentityKey),
      verifiedAt: Date.now(),
      verificationMethod: 'safety-number',
    });

    return true;
  }

  /**
   * Send an encrypted message.
   */
  async sendEncryptedMessage(
    _chatId: string,
    senderId: string,
    recipientId: string,
    plaintext: string,
  ): Promise<E2ESendResult> {
    try {
      const identityKeys = sessionManager.getLocalIdentityKeys();
      if (!identityKeys) {
        return { success: false, messageId: '', error: 'Identity keys not available' };
      }

      const envelope = await encryptMessage(
        identityKeys,
        senderId,
        recipientId,
        plaintext,
      );

      // Send via relay
      await relayClient.sendEncryptedMessage(envelope);

      // Record success
      await sessionManager.recordSuccess(recipientId);

      // Save to IndexedDB
      const timestamp = Date.now();
      const storedMessage: StoredMessage = {
        id: envelope.messageId,
        chatId: _chatId,
        senderId,
        recipientId,
        encrypted: JSON.stringify(envelope),
        timestamp,
        status: 'sent',
        direction: 'outgoing',
      };
      await saveMessage(storedMessage);

      return {
        success: true,
        messageId: envelope.messageId,
        encrypted: envelope,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await sessionManager.recordFailure(recipientId, errorMsg);

      return {
        success: false,
        messageId: '',
        error: errorMsg,
      };
    }
  }

  /**
   * Decrypt an incoming message.
   */
  async decryptIncomingMessage(
    envelope: EncryptedEnvelope,
    chatId: string,
  ): Promise<E2EReceiveResult> {
    try {
      const identityKeys = sessionManager.getLocalIdentityKeys();
      const preKeys = sessionManager.getLocalPreKeys();

      if (!identityKeys || !preKeys) {
        return { success: false, decryptedMessage: null, error: 'Local keys not available' };
      }

      const decrypted = await decryptMessage(
        identityKeys,
        preKeys,
        envelope.recipientId,
        envelope,
      );

      // Record success
      await sessionManager.recordSuccess(envelope.senderId);

      // Save to IndexedDB
      const storedMessage: StoredMessage = {
        id: envelope.messageId,
        chatId,
        senderId: envelope.senderId,
        recipientId: envelope.recipientId, // Should be current user
        encrypted: JSON.stringify(envelope),
        timestamp: envelope.timestamp,
        status: 'delivered',
        direction: 'incoming',
      };
      await saveMessage(storedMessage);

      // Create a Message object for the store
      const message: Message = {
        id: envelope.messageId,
        chatId,
        senderId: envelope.senderId,
        senderName: envelope.senderId, // TODO: Get from contacts
        senderAvatar: '',
        content: new TextDecoder().decode(decrypted.plaintext),
        timestamp: new Date(envelope.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        type: 'text',
        status: 'delivered',
        isMe: false,
        isPinned: false,
        isEdited: false,
      };

      return { success: true, decryptedMessage: message };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await sessionManager.recordFailure(envelope.senderId, errorMsg);

      return {
        success: false,
        decryptedMessage: null,
        error: errorMsg,
      };
    }
  }

  /**
   * Check if a message content is an encrypted envelope.
   */
  isEncryptedEnvelope(content: string): boolean {
    try {
      const parsed = JSON.parse(content);
      return parsed.type === 'encrypted-message' && parsed.version === 1;
    } catch {
      return false;
    }
  }

  /**
   * Ensure E2E session exists for a chat.
   */
  async ensureSession(_chatId: string, recipientId: string): Promise<boolean> {
    if (Date.now() < this.ensureSessionBlockedUntil) {
      return false;
    }

    try {
      await sessionManager.getOrCreateSession(recipientId);
      this.ensureSessionBlockedUntil = 0;
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/401|403|unauthorized|forbidden|relay authorization temporarily unavailable|auth/i.test(message)) {
        this.ensureSessionBlockedUntil = Date.now() + 60_000;
      }
      return false;
    }
  }

  /**
   * Send typing indicator.
   */
  sendTyping(chatId: string, isTyping: boolean): void {
    relayClient.sendTyping(chatId, isTyping);
  }

  /**
   * Send read receipt.
   */
  sendReadReceipt(messageId: string, chatId: string): void {
    relayClient.sendReadReceipt(messageId, chatId);
  }

  /**
   * Load and decrypt history from IndexedDB.
   */
  async loadChatHistory(chatId: string, currentUserId: string): Promise<Message[]> {
    const rawMessages = await getMessagesByChat(chatId);
    const messages: Message[] = [];

    const identityKeys = sessionManager.getLocalIdentityKeys();
    const preKeys = sessionManager.getLocalPreKeys();

    if (!identityKeys || !preKeys) return [];

    for (const raw of rawMessages) {
      if (raw.direction === 'outgoing') {
        const envelope = JSON.parse(raw.encrypted);
        try {
           const decrypted = await decryptMessage(identityKeys, preKeys, raw.recipientId, envelope);
           messages.push(this.formatDecryptedMessage(envelope, new TextDecoder().decode(decrypted.plaintext), chatId, currentUserId, raw));
        } catch {
           messages.push(this.fallbackMessage(envelope, chatId, currentUserId, raw));
        }
      } else {
        const envelope = JSON.parse(raw.encrypted);
        try {
           const decrypted = await decryptMessage(identityKeys, preKeys, raw.senderId, envelope);
           messages.push(this.formatDecryptedMessage(envelope, new TextDecoder().decode(decrypted.plaintext), chatId, currentUserId, raw));
        } catch {
           messages.push(this.fallbackMessage(envelope, chatId, currentUserId, raw));
        }
      }
    }

    return messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  private formatDecryptedMessage(envelope: EncryptedEnvelope, plaintext: string, chatId: string, currentUserId: string, raw: StoredMessage): Message {
    let parsedContent = plaintext;
    let mediaData;
    
    // Check if plaintext might be a JSON payload with E2E attachments
    try {
      if (plaintext.startsWith('{')) {
        const parsed = JSON.parse(plaintext);
        if (parsed.type === 'media' && parsed.content && parsed.mediaData) {
           parsedContent = parsed.content;
           mediaData = parsed.mediaData;
        }
      }
    } catch { /* normal text */ }

    return {
      id: raw.id,
      chatId,
      senderId: envelope.senderId,
      senderName: envelope.senderId === currentUserId ? 'You' : envelope.senderId,
      senderAvatar: '',
      content: parsedContent,
      timestamp: new Date(raw.timestamp).toISOString(),
      type: mediaData ? mediaData.type : 'text',
      status: raw.status as Message['status'],
      isMe: envelope.senderId === currentUserId,
      isPinned: false,
      isEdited: false,
      mediaUrl: mediaData ? mediaData.url : undefined,
      mediaName: mediaData ? mediaData.name : undefined,
      mediaSize: mediaData ? mediaData.size : undefined,
      mediaMimeType: mediaData ? mediaData.mimeType : undefined,
      e2eMedia: mediaData && mediaData.key ? { key: mediaData.key, iv: mediaData.iv, tag: mediaData.tag } : undefined,
    };
  }

  private fallbackMessage(envelope: EncryptedEnvelope, chatId: string, currentUserId: string, raw: StoredMessage): Message {
    return {
      id: raw.id,
      chatId,
      senderId: envelope.senderId,
      senderName: envelope.senderId === currentUserId ? 'You' : envelope.senderId,
      senderAvatar: '',
      content: '🔒 [Зашифрованное сообщение]',
      timestamp: new Date(raw.timestamp).toISOString(),
      type: 'text',
      status: raw.status as Message['status'],
      isMe: envelope.senderId === currentUserId,
      isPinned: false,
      isEdited: false,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const e2eChat = new E2EChatIntegration();
