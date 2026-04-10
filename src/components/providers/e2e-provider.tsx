/**
 * E2E Provider
 *
 * Initializes E2E encryption at app startup and provides
 * E2E status to all child components via React Context.
 *
 * Must be placed inside SessionProvider so it can access
 * the authenticated user's session.
 */

'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { sessionManager } from '@/lib/crypto/session-manager';
import { relayClient } from '@/lib/crypto/relay-client';
import type { RelayEvent } from '@/lib/crypto/relay-client';
import type { EncryptedEnvelope } from '@/lib/crypto/encrypt';

// ─── Context ─────────────────────────────────────────────────────────────────

interface E2EContextValue {
  isInitialized: boolean;
  isRelayConnected: boolean;
  error: string | null;
  sessionCount: number;
  onIncomingEncryptedMessage: (handler: (envelope: EncryptedEnvelope) => void) => void;
  reconnect: () => Promise<void>;
}

const E2EContext = createContext<E2EContextValue | null>(null);

export function useE2EContext(): E2EContextValue {
  const context = useContext(E2EContext);
  if (!context) {
    throw new Error('useE2EContext must be used within an E2EProvider');
  }
  return context;
}

// ─── Provider ────────────────────────────────────────────────────────────────

interface E2EProviderProps {
  children: React.ReactNode;
  enabled?: boolean; // Allow disabling E2E for testing
}

export function E2EProvider({ children, enabled = true }: E2EProviderProps) {
  const { status } = useSession();
  const isAuthReady = status === 'authenticated';
  const [e2eReady, setE2eReady] = useState(false);
  const [isRelayConnected, setIsRelayConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const isInitialized = !enabled || !isAuthReady || e2eReady;

  const incomingHandlersRef = useRef(new Set<(envelope: EncryptedEnvelope) => void>());
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Register handler for incoming encrypted messages
  const onIncomingEncryptedMessage = useCallback((handler: (envelope: EncryptedEnvelope) => void) => {
    incomingHandlersRef.current.add(handler);
    return () => {
      incomingHandlersRef.current.delete(handler);
    };
  }, []);

  // Reconnect to relay
  const reconnect = useCallback(async () => {
    if (!enabled || !isAuthReady) return;
    try {
      setError(null);
      await relayClient.connect();
      setIsRelayConnected(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Reconnection failed';
      setError(msg);
      throw err;
    }
  }, [enabled, isAuthReady]);

  // Initialize E2E on mount
  useEffect(() => {
    if (!enabled || !isAuthReady) {
      relayClient.disconnect();
      sessionManager.stopAutoSave();
      return;
    }

    let cancelled = false;

    async function initialize() {
      try {
        // Initialize session manager (loads identity keys, restores sessions)
        await sessionManager.initialize();

        if (cancelled) return;

        // Connect to relay
        await relayClient.connect();

        if (cancelled) return;

        // Set up relay event handler
        unsubscribeRef.current = relayClient.on((event: RelayEvent) => {
          if (event.type === 'message') {
            for (const handler of incomingHandlersRef.current) {
              handler(event.data);
            }
          } else if (event.type === 'connected') {
            setIsRelayConnected(true);
            setError(null);
          } else if (event.type === 'disconnected') {
            setIsRelayConnected(false);
          } else if (event.type === 'error') {
            setError(event.error.message);
          }
        });

        if (!cancelled) {
          setE2eReady(true);
          setIsRelayConnected(true);
          setSessionCount(sessionManager.getAllSessions().size);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'E2E initialization failed';
          setError(msg);
          console.error('[E2EProvider] Initialization failed:', err);
        }
      }
    }

    initialize();

    return () => {
      cancelled = true;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      relayClient.disconnect();
      sessionManager.stopAutoSave();
    };
  }, [enabled, isAuthReady]);

  const contextValue: E2EContextValue = {
    isInitialized,
    isRelayConnected,
    error,
    sessionCount,
    onIncomingEncryptedMessage,
    reconnect,
  };

  return (
    <E2EContext.Provider value={contextValue}>
      {children}
    </E2EContext.Provider>
  );
}
