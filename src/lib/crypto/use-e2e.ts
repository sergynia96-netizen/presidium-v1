/**
 * useE2E React Hook
 *
 * Provides E2E encryption functionality to React components.
 * Manages:
 * - Session manager initialization
 * - Relay client connection
 * - Message encryption/decryption
 * - Session status
 * - Safety number verification
 *
 * Usage:
 *   const e2e = useE2E();
 *   const encrypted = await e2e.encryptMessage(chatId, recipientId, "Hello");
 *   const { safetyNumber } = await e2e.getSafetyNumber(recipientId);
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { sessionManager } from './session-manager';
import { relayClient } from './relay-client';
import { messageProcessor } from './message-processor';
import { generateSafetyNumbers, compareSafetyNumbers } from './fingerprint';
import { getShortFingerprint } from './identity';
import { getContact } from './store';
import { hexToBytes } from './utils';
import { KeyVault } from './vault';
import type { EncryptedEnvelope, DecryptedMessage } from './encrypt';
import type { SafetyNumber, VerificationResult } from './fingerprint';
import type { RelayEvent } from './relay-client';
import { useAppStore } from '@/store/use-app-store';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UseE2EReturn {
  // Status
  isInitialized: boolean;
  isRelayConnected: boolean;
  sessionCount: number;

  // Actions
  encryptMessage: (chatId: string, recipientId: string, plaintext: string) => Promise<void>;
  decryptMessage: (envelope: EncryptedEnvelope) => Promise<DecryptedMessage>;
  getSafetyNumber: (recipientId: string) => Promise<SafetyNumber | null>;
  verifySafetyNumber: (recipientId: string, expectedNumber: string) => Promise<VerificationResult>;
  sendTyping: (chatId: string, isTyping: boolean) => void;
  sendReadReceipt: (messageId: string, chatId: string) => void;

  // Events
  onMessage: (handler: (envelope: EncryptedEnvelope) => void) => () => void;
  onTyping: (handler: (userId: string, chatId: string, isTyping: boolean) => void) => () => void;
  onPresence: (handler: (userId: string, online: boolean) => void) => () => void;

  // Connection
  connect: () => Promise<void>;
  disconnect: () => void;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useE2E(): UseE2EReturn {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRelayConnected, setIsRelayConnected] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

  const messageHandlersRef = useRef(new Set<(envelope: EncryptedEnvelope) => void>());
  const typingHandlersRef = useRef(new Set<(userId: string, chatId: string, isTyping: boolean) => void>());
  const presenceHandlersRef = useRef(new Set<(userId: string, online: boolean) => void>());

  // ─── Initialization ─────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const vaultPassword = KeyVault.getVaultPassword() || undefined;

        // Initialize session manager
        await sessionManager.initialize(vaultPassword);

        // Connect to relay
        await relayClient.connect();

        if (mounted) {
          setIsInitialized(true);
          setIsRelayConnected(true);
          setSessionCount(sessionManager.getAllSessions().size);
        }
      } catch (error) {
        console.error('[useE2E] Initialization failed:', error);
        // Don't set isInitialized to true if initialization failed
      }
    }

    initialize();

    return () => {
      mounted = false;
      relayClient.disconnect();
      sessionManager.stopAutoSave();
    };
  }, []);

  // ─── Relay Event Handlers ───────────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = relayClient.on((event: RelayEvent) => {
      switch (event.type) {
        case 'message':
          for (const handler of messageHandlersRef.current) {
            handler(event.data);
          }
          break;

        case 'typing':
          for (const handler of typingHandlersRef.current) {
            handler(event.data.userId, event.data.chatId, event.data.isTyping);
          }
          break;

        case 'presence':
          for (const handler of presenceHandlersRef.current) {
            handler(event.data.userId, event.data.online);
          }
          break;

        case 'connected':
          setIsRelayConnected(true);
          break;

        case 'disconnected':
          setIsRelayConnected(false);
          break;
      }
    });

    return unsubscribe;
  }, []);

  // ─── Actions ────────────────────────────────────────────────────────────

  const encryptMessage = useCallback(async (
    chatId: string,
    recipientId: string,
    plaintext: string,
  ): Promise<void> => {
    const identityKeys = sessionManager.getLocalIdentityKeys();
    if (!identityKeys) {
      throw new Error('Identity keys not available');
    }

    // Get real user ID from auth store
    const senderId = useAppStore.getState().user?.id;
    if (!senderId) {
      throw new Error('User not authenticated');
    }

    await messageProcessor.processOutgoing({
      chatId,
      senderId,
      recipientId,
      plaintext,
    });
  }, []);

  const decryptMessage = useCallback(async (
    envelope: EncryptedEnvelope,
  ): Promise<DecryptedMessage> => {
    const identityKeys = sessionManager.getLocalIdentityKeys();
    const preKeys = sessionManager.getLocalPreKeys();

    if (!identityKeys || !preKeys) {
      throw new Error('Local keys not available');
    }

    // Import decryptMessage from encrypt module
    const { decryptMessage: decrypt } = await import('./encrypt');

    return decrypt(
      identityKeys,
      preKeys,
      envelope.recipientId,
      envelope,
    );
  }, []);

  const getSafetyNumber = useCallback(async (
    recipientId: string,
  ): Promise<SafetyNumber | null> => {
    const session = sessionManager.getSession(recipientId);
    if (!session || !session.remoteIdentityKey) {
      return null;
    }

    const identityKeys = sessionManager.getLocalIdentityKeys();
    if (!identityKeys) {
      return null;
    }

    return generateSafetyNumbers(identityKeys, session.remoteIdentityKey);
  }, []);

  const verifySafetyNumber = useCallback(async (
    recipientId: string,
    expectedNumber: string,
  ): Promise<VerificationResult> => {
    const contact = await getContact(recipientId);
    if (!contact) {
      return {
        isVerified: false,
        localFingerprint: '',
        remoteFingerprint: '',
        mismatch: true,
      };
    }

    const actualKey = hexToBytes(contact.identityKey);
    const actualFingerprint = getShortFingerprint(actualKey, 16);

    return {
      isVerified: compareSafetyNumbers(expectedNumber, actualFingerprint),
      localFingerprint: '',
      remoteFingerprint: actualFingerprint,
      mismatch: !compareSafetyNumbers(expectedNumber, actualFingerprint),
    };
  }, []);

  const sendTyping = useCallback((chatId: string, isTyping: boolean) => {
    relayClient.sendTyping(chatId, isTyping);
  }, []);

  const sendReadReceipt = useCallback((messageId: string, chatId: string) => {
    relayClient.sendReadReceipt(messageId, chatId);
  }, []);

  // ─── Event Subscriptions ────────────────────────────────────────────────

  const onMessage = useCallback((handler: (envelope: EncryptedEnvelope) => void) => {
    messageHandlersRef.current.add(handler);
    return () => {
      messageHandlersRef.current.delete(handler);
    };
  }, []);

  const onTyping = useCallback((handler: (userId: string, chatId: string, isTyping: boolean) => void) => {
    typingHandlersRef.current.add(handler);
    return () => {
      typingHandlersRef.current.delete(handler);
    };
  }, []);

  const onPresence = useCallback((handler: (userId: string, online: boolean) => void) => {
    presenceHandlersRef.current.add(handler);
    return () => {
      presenceHandlersRef.current.delete(handler);
    };
  }, []);

  // ─── Connection ─────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    await relayClient.connect();
  }, []);

  const disconnect = useCallback(() => {
    relayClient.disconnect();
  }, []);

  // ─── Return ─────────────────────────────────────────────────────────────

  return {
    isInitialized,
    isRelayConnected,
    sessionCount,
    encryptMessage,
    decryptMessage,
    getSafetyNumber,
    verifySafetyNumber,
    sendTyping,
    sendReadReceipt,
    onMessage,
    onTyping,
    onPresence,
    connect,
    disconnect,
  };
}
