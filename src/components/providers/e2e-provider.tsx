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

/*
 * CHANGELOG (Codex)
 * 2026-04-17:
 * - Added pre-key upload cooldown for auth-related failures.
 * - Changed incoming encrypted message subscription signature to return unsubscribe.
 * - Goal: reduce repeated failing relay calls and keep subscription lifecycle explicit.
 * - Synced provider connection flags with authenticated relay status to avoid false-ready UI state.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { sessionManager } from '@/lib/crypto/session-manager';
import { relayClient } from '@/lib/crypto/relay-client';
import type { RelayEvent } from '@/lib/crypto/relay-client';
import type { EncryptedEnvelope } from '@/lib/crypto/encrypt';
import { KeyVault } from '@/lib/crypto/vault';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// ─── Context ─────────────────────────────────────────────────────────────────

interface E2EContextValue {
  isInitialized: boolean;
  isRelayConnected: boolean;
  error: string | null;
  sessionCount: number;
  onIncomingEncryptedMessage: (handler: (envelope: EncryptedEnvelope) => void) => () => void;
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
  const { status, data: session } = useSession();
  const isAuthReady = status === 'authenticated';
  const [e2eReady, setE2eReady] = useState(false);
  const [isRelayConnected, setIsRelayConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [vaultPassword, setVaultPassword] = useState<string | null>(() => KeyVault.getVaultPassword());
  const [vaultPasswordInput, setVaultPasswordInput] = useState('');
  const [showVaultDialog, setShowVaultDialog] = useState(false);
  const [unlockingVault, setUnlockingVault] = useState(false);
  const isInitialized = !enabled || !isAuthReady || e2eReady;

  const incomingHandlersRef = useRef(new Set<(envelope: EncryptedEnvelope) => void>());
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const preKeyUploadBlockedUntilRef = useRef(0);

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

  const handleVaultUnlock = useCallback(async () => {
    const password = vaultPasswordInput.trim();
    if (!password) {
      setError('Vault password is required');
      return;
    }

    try {
      setUnlockingVault(true);
      KeyVault.setVaultPassword(password);
      setVaultPassword(password);
      setShowVaultDialog(false);
      setVaultPasswordInput('');
      setError(null);
    } finally {
      setUnlockingVault(false);
    }
  }, [vaultPasswordInput]);

  // Initialize E2E on mount
  useEffect(() => {
    if (!enabled) {
      relayClient.disconnect();
      sessionManager.stopAutoSave();
      return;
    }

    if (status === 'unauthenticated') {
      relayClient.disconnect();
      sessionManager.stopAutoSave();
      setE2eReady(false);
      setIsRelayConnected(false);
      setShowVaultDialog(false);
      setVaultPassword(null);
      setVaultPasswordInput('');
      setSessionCount(0);
      KeyVault.clearVault();
      return;
    }

    if (!isAuthReady) return;

    let cancelled = false;

    async function initialize() {
      try {
        const activePassword = vaultPassword || KeyVault.getVaultPassword();
        if (!activePassword) {
          setShowVaultDialog(true);
          setError('Vault password is required to initialize E2E');
          return;
        }

        if (!cancelled) {
          setShowVaultDialog(false);
        }

        // Initialize session manager (loads identity keys, restores sessions)
        await sessionManager.initialize(activePassword);

        if (cancelled) return;

        // Connect to relay
        await relayClient.connect();

        if (cancelled) return;

        // Publish our pre-key bundle so peers can establish sessions.
        const localPreKeys = sessionManager.getLocalPreKeys();
        if (localPreKeys && Date.now() >= preKeyUploadBlockedUntilRef.current) {
          try {
            await relayClient.uploadPreKeyBundle(localPreKeys);
          } catch (uploadError) {
            const uploadMessage = uploadError instanceof Error ? uploadError.message : String(uploadError);
            if (/401|403|unauthorized|forbidden|auth is temporarily blocked/i.test(uploadMessage)) {
              preKeyUploadBlockedUntilRef.current = Date.now() + 60_000;
            }
            console.warn('[E2EProvider] Failed to upload pre-key bundle:', uploadError);
          }
        }

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
          setIsRelayConnected(relayClient.connected);
          setSessionCount(sessionManager.getAllSessions().size);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'E2E initialization failed';
          if (
            msg.toLowerCase().includes('password required') ||
            msg.toLowerCase().includes('decrypt identity keys')
          ) {
            setShowVaultDialog(true);
          }
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
  }, [enabled, status, isAuthReady, session?.user?.id, vaultPassword]);

  const contextValue: E2EContextValue = {
    isInitialized,
    isRelayConnected,
    error,
    sessionCount,
    onIncomingEncryptedMessage,
    reconnect,
  };

  return (
    <>
      <E2EContext.Provider value={contextValue}>
        {children}
      </E2EContext.Provider>

      <Dialog open={showVaultDialog && enabled && isAuthReady}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Unlock Encrypted Key Vault</DialogTitle>
            <DialogDescription>
              Enter your vault password to unlock local E2E identity keys on this device.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="vault-password">Vault password</Label>
            <Input
              id="vault-password"
              type="password"
              value={vaultPasswordInput}
              autoComplete="current-password"
              onChange={(event) => setVaultPasswordInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleVaultUnlock();
                }
              }}
              placeholder="Enter vault password"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                void handleVaultUnlock();
              }}
              disabled={unlockingVault || !vaultPasswordInput.trim()}
            >
              {unlockingVault ? 'Unlocking...' : 'Unlock Vault'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
