/**
 * Relay E2E Client
 *
 * HTTP + WebSocket client for the relay backend.
 * Handles:
 * - Pre-key bundle upload/download
 * - Encrypted message delivery
 * - WebSocket connection management
 * - Message acknowledgment
 * - Presence updates
 * - Typing indicators
 *
 * Architecture:
 * - HTTP REST for pre-key management and initial setup
 * - WebSocket for real-time encrypted message delivery
 * - Automatic reconnection with exponential backoff
 * - Message queue for offline delivery
 */

/*
 * CHANGELOG (Codex)
 * 2026-04-17:
 * - Added stronger auth backoff and auth-error classification.
 * - Added cooldown on `/api/relay/token` auth failures (401/403) to stop retry storms.
 * - Prevented endless reconnect loops when token/auth is invalid.
 * - Kept reconnect reset only after explicit relay `connected` auth confirmation.
 */

import { clearRelayAccessToken, getRelayAccessToken, setRelayAccessToken } from '../relay-auth';
import type { PreKeyBundle, SerializedPreKeyBundle } from './prekeys';
import { serializePreKeyBundle, deserializePreKeyBundle } from './prekeys';
import type { EncryptedEnvelope } from './encrypt';

export interface RelayConfig {
  httpBaseUrl: string;
  wsBaseUrl: string;
  reconnectIntervalMs: number;
  maxReconnectIntervalMs: number;
  maxReconnectAttempts: number;
  pingIntervalMs: number;
  pongTimeoutMs: number;
}

export interface RelayMessageEnvelope {
  type: 'encrypted-message';
  version: 1;
  senderId: string;
  recipientId: string;
  messageId: string;
  timestamp: number;
  ciphertext: string;
  iv: string;
  tag: string;
  header: {
    publicKey: string;
    counter: number;
    previousCounter: number;
  };
  x3dhInitiate?: {
    identityKey: string;
    ephemeralKey: string;
    signedPreKeyId: number;
    oneTimePreKeyId?: number;
  };
}

export interface RelayAckMessage {
  type: 'ack';
  messageId: string;
  receivedAt: number;
}

export interface RelayTypingMessage {
  type: 'typing';
  chatId: string;
  userId: string;
  isTyping: boolean;
}

export interface RelayPresenceMessage {
  type: 'presence';
  userId: string;
  online: boolean;
  lastSeen: number;
}

export type RelayIncomingMessage =
  | RelayMessageEnvelope
  | RelayAckMessage
  | RelayTypingMessage
  | RelayPresenceMessage
  | { type: 'pong' }
  | { type: 'connected' }
  | { type: 'error'; message: string };

export type RelayEvent =
  | { type: 'message'; data: RelayMessageEnvelope }
  | { type: 'ack'; data: RelayAckMessage }
  | { type: 'typing'; data: RelayTypingMessage }
  | { type: 'presence'; data: RelayPresenceMessage }
  | { type: 'connected' }
  | { type: 'disconnected'; reason: string }
  | { type: 'error'; error: Error };

export type RelayEventHandler = (event: RelayEvent) => void;

// ─── Default Config ─────────────────────────────────────────────────────────

const DEFAULT_CONFIG: RelayConfig = {
  httpBaseUrl: process.env.NEXT_PUBLIC_RELAY_HTTP_URL || 'http://127.0.0.1:3001',
  wsBaseUrl: process.env.NEXT_PUBLIC_RELAY_WS_URL || 'ws://127.0.0.1:3001/ws',
  reconnectIntervalMs: 1000,
  maxReconnectIntervalMs: 30000,
  maxReconnectAttempts: 10,
  pingIntervalMs: 30000,
  pongTimeoutMs: 10000,
};
const AUTH_RETRY_BACKOFF_MS = 120_000;
const AUTH_HANDSHAKE_TIMEOUT_MS = 10_000;

function isAuthRelatedMessage(message: string): boolean {
  return /401|403|unauthorized|forbidden|auth|token/i.test(message);
}

function resolveRelayWebSocketUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  try {
    const parsed = new URL(trimmed);
    const normalizedPath = parsed.pathname.replace(/\/+$/, '');
    if (!normalizedPath || normalizedPath === '/') {
      parsed.pathname = '/ws';
    } else if (!normalizedPath.endsWith('/ws')) {
      parsed.pathname = `${normalizedPath}/ws`;
    } else {
      parsed.pathname = normalizedPath;
    }
    return parsed.toString();
  } catch {
    if (trimmed.endsWith('/ws')) return trimmed;
    return `${trimmed}/ws`;
  }
}

// ─── Relay Client ────────────────────────────────────────────────────────────

class RelayE2EClient {
  private config: RelayConfig;
  private ws: WebSocket | null = null;
  private handlers = new Set<RelayEventHandler>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;
  private isConnecting = false;
  private pendingMessages = new Map<string, { envelope: EncryptedEnvelope; resolve: () => void; reject: (error: Error) => void }>();
  private authRetryAt = 0;
  private pendingConnectResolver: (() => void) | null = null;
  private pendingConnectRejecter: ((error: Error) => void) | null = null;
  private authHandshakeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<RelayConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private isAuthRetryPending(): boolean {
    return this.authRetryAt > Date.now();
  }

  private activateAuthRetryBackoff(): void {
    this.authRetryAt = Date.now() + AUTH_RETRY_BACKOFF_MS;
  }

  private clearAuthRetryBackoff(): void {
    this.authRetryAt = 0;
  }

  private clearAuthHandshakeTimer(): void {
    if (!this.authHandshakeTimer) return;
    clearTimeout(this.authHandshakeTimer);
    this.authHandshakeTimer = null;
  }

  private resolvePendingConnect(): void {
    const resolve = this.pendingConnectResolver;
    this.pendingConnectResolver = null;
    this.pendingConnectRejecter = null;
    this.clearAuthHandshakeTimer();
    if (resolve) resolve();
  }

  private rejectPendingConnect(error: Error): void {
    const reject = this.pendingConnectRejecter;
    this.pendingConnectResolver = null;
    this.pendingConnectRejecter = null;
    this.clearAuthHandshakeTimer();
    if (reject) reject(error);
  }

  private isJwtExpired(token: string): boolean {
    try {
      const [, payloadBase64] = token.split('.');
      if (!payloadBase64) return true;
      const payloadJson = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson) as { exp?: number };
      if (typeof payload.exp !== 'number') return false;
      // Refresh a little earlier to avoid edge-expiry races.
      return payload.exp * 1000 <= Date.now() + 60_000;
    } catch {
      return true;
    }
  }

  private async ensureRelayToken(forceRefresh: boolean = false): Promise<string> {
    const existing = getRelayAccessToken();
    if (!forceRefresh && existing && !this.isJwtExpired(existing)) {
      return existing;
    }

    if (existing) {
      clearRelayAccessToken();
    }

    if (typeof window === 'undefined') {
      throw new Error('Relay token is missing');
    }

    const response = await fetch('/api/relay/token', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        this.activateAuthRetryBackoff();
        clearRelayAccessToken();
      }
      throw new Error(`Failed to get relay token (${response.status})`);
    }

    const data = (await response.json().catch(() => ({}))) as { token?: string };
    const token = typeof data.token === 'string' ? data.token : '';
    if (!token) {
      throw new Error('Relay token response is invalid');
    }

    setRelayAccessToken(token);
    return token;
  }

  private async fetchWithRelayAuth(
    input: string,
    init: RequestInit = {},
  ): Promise<Response> {
    if (this.isAuthRetryPending()) {
      throw new Error('Relay auth is temporarily blocked after recent unauthorized response');
    }

    let token: string;
    try {
      token = await this.ensureRelayToken();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthRelatedMessage(message)) {
        this.activateAuthRetryBackoff();
      }
      throw error;
    }
    const headers = new Headers(init.headers || {});
    headers.set('Authorization', `Bearer ${token}`);

    let response = await fetch(input, {
      ...init,
      headers,
    });

    if (response.status !== 401) {
      this.clearAuthRetryBackoff();
      return response;
    }

    // Token could be stale/revoked. Refresh once and retry.
    clearRelayAccessToken();
    const refreshedToken = await this.ensureRelayToken(true);
    const retryHeaders = new Headers(init.headers || {});
    retryHeaders.set('Authorization', `Bearer ${refreshedToken}`);

    response = await fetch(input, {
      ...init,
      headers: retryHeaders,
    });

    if (response.status === 401) {
      this.activateAuthRetryBackoff();
    } else {
      this.clearAuthRetryBackoff();
    }

    return response;
  }

  // ─── Connection Management ──────────────────────────────────────────────

  /**
   * Connect to the relay via WebSocket.
   */
  connect(): Promise<void> {
    if (this.isConnected) return Promise.resolve();
    if (this.isConnecting) return this.waitForConnection();
    if (this.isAuthRetryPending()) {
      return Promise.reject(new Error('Relay auth is temporarily blocked after recent unauthorized response'));
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      this.pendingConnectResolver = resolve;
      this.pendingConnectRejecter = reject;

      try {
        const wsUrl = resolveRelayWebSocketUrl(this.config.wsBaseUrl);
        void (async () => {
          let token: string;
          try {
            token = await this.ensureRelayToken();
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (isAuthRelatedMessage(message)) {
              this.activateAuthRetryBackoff();
              this.reconnectAttempts = this.config.maxReconnectAttempts;
            }
            throw error;
          }
          console.log(`[RelayE2EClient] Token: ${token ? `present (${token.length} chars)` : 'missing'}`);

          this.ws = new WebSocket(wsUrl);

          this.ws.onopen = () => {
            console.log(`[RelayE2EClient] Connected to ${wsUrl}`);

            // Authenticate (relay expects payload.token)
            try {
              this.ws!.send(JSON.stringify({ type: 'auth', payload: { token } }));
            } catch (error) {
              this.isConnecting = false;
              this.rejectPendingConnect(
                error instanceof Error ? error : new Error('Failed to send relay auth payload'),
              );
              this.ws?.close(4001, 'Authentication payload failed');
              return;
            }

            // Do not mark connected yet. We wait for relay auth confirmation (`type: connected`).
            this.clearAuthHandshakeTimer();
            this.authHandshakeTimer = setTimeout(() => {
              this.isConnecting = false;
              this.rejectPendingConnect(new Error('Relay auth handshake timed out'));
              this.ws?.close(4001, 'Authentication timeout');
            }, AUTH_HANDSHAKE_TIMEOUT_MS);
          };

          this.ws.onclose = (event) => {
            this.isConnected = false;
            this.isConnecting = false;
            this.stopPing();
            this.rejectPendingConnect(new Error(event.reason || `Connection closed (${event.code})`));

            if (event.code === 4001 || event.code === 4002) {
              clearRelayAccessToken();
              // Auth/token failures should not loop reconnect forever.
              this.activateAuthRetryBackoff();
              this.reconnectAttempts = this.config.maxReconnectAttempts;
            }

            this.emit({ type: 'disconnected', reason: event.reason || 'Connection closed' });

            // Attempt reconnection
            if (!this.isAuthRetryPending() && this.reconnectAttempts < this.config.maxReconnectAttempts) {
              this.scheduleReconnect();
            }
          };

          this.ws.onerror = (_event) => {
            this.isConnecting = false;
            const wsError = new Error('WebSocket error');
            this.emit({ type: 'error', error: wsError });
            this.rejectPendingConnect(wsError);
          };

          this.ws.onmessage = (event) => {
            this.handleMessage(event.data);
          };
        })().catch((error) => {
          this.isConnecting = false;
          this.rejectPendingConnect(error instanceof Error ? error : new Error(String(error)));
        });
      } catch (error) {
        this.isConnecting = false;
        this.rejectPendingConnect(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Disconnect from the relay.
   */
  disconnect(): void {
    this.stopPing();
    this.rejectPendingConnect(new Error('Client disconnect'));
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
    this.reconnectAttempts = this.config.maxReconnectAttempts; // Prevent reconnection
  }

  /**
   * Wait for connection to be established.
   */
  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const check = () => {
        if (this.isConnected) {
          resolve();
          return;
        }
        if (!this.isConnecting) {
          reject(new Error('Relay connection attempt failed'));
          return;
        }
        if (Date.now() - startedAt > AUTH_HANDSHAKE_TIMEOUT_MS + 5000) {
          reject(new Error('Timed out waiting for relay connection'));
          return;
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * Schedule a reconnection attempt.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectAttempts++;
    const delay = Math.min(
      this.config.reconnectIntervalMs * Math.pow(2, this.reconnectAttempts - 1),
      this.config.maxReconnectIntervalMs,
    );

    console.log(`[RelayE2EClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {
        // Reconnect will be scheduled again via onclose
      });
    }, delay);
  }

  // ─── Ping/Pong ──────────────────────────────────────────────────────────

  private startPing(): void {
    this.stopPing();

    this.pingTimer = setInterval(() => {
      if (!this.isConnected || !this.ws) return;

      try {
        this.ws.send(JSON.stringify({ type: 'ping' }));

        // Set pong timeout
        this.pongTimer = setTimeout(() => {
          console.warn('[RelayE2EClient] Pong timeout, reconnecting...');
          this.ws?.close(1000, 'Pong timeout');
        }, this.config.pongTimeoutMs);
      } catch {
        // WebSocket may be closing
      }
    }, this.config.pingIntervalMs);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  // ─── Message Handling ───────────────────────────────────────────────────

  private handleMessage(data: string): void {
    try {
      const parsed = JSON.parse(data) as RelayIncomingMessage;

      switch (parsed.type) {
        case 'encrypted-message':
          this.emit({ type: 'message', data: parsed as RelayMessageEnvelope });
          break;

        case 'ack':
          this.emit({ type: 'ack', data: parsed as RelayAckMessage });
          this.handleAck(parsed as RelayAckMessage);
          break;

        case 'typing':
          this.emit({ type: 'typing', data: parsed as RelayTypingMessage });
          break;

        case 'presence':
          this.emit({ type: 'presence', data: parsed as RelayPresenceMessage });
          break;

        case 'pong':
          if (this.pongTimer) {
            clearTimeout(this.pongTimer);
            this.pongTimer = null;
          }
          break;

        case 'connected':
          // Reset reconnect attempts only after successful relay auth.
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          this.clearAuthRetryBackoff();
          this.startPing();
          this.resolvePendingConnect();
          this.emit({ type: 'connected' });
          console.log('[RelayE2EClient] Auth response:', JSON.stringify(parsed));
          break;

        case 'error': {
          const parsedAny = parsed as any;
          const errorMessage =
            parsedAny?.message ||
            parsedAny?.payload?.message ||
            'Relay error';
          const errorCode = parsedAny?.payload?.code;
          console.log('[RelayE2EClient] Error response:', JSON.stringify(parsed));

          if (errorCode === 'auth_required' || /auth|token|unauthorized/i.test(String(errorMessage))) {
            clearRelayAccessToken();
            // Stop auto-reconnect storm when relay auth is invalid.
            this.activateAuthRetryBackoff();
            this.reconnectAttempts = this.config.maxReconnectAttempts;
            this.isConnected = false;
            this.isConnecting = false;
            this.rejectPendingConnect(new Error(String(errorMessage)));
            this.ws?.close(4001, 'Authentication failed');
          }

          this.emit({ type: 'error', error: new Error(String(errorMessage)) });
          break;
        }

        default:
          console.warn('[RelayE2EClient] Unknown message type:', (parsed as any).type);
      }
    } catch (error) {
      console.error('[RelayE2EClient] Failed to parse message:', error);
    }
  }

  private handleAck(ack: RelayAckMessage): void {
    const pending = this.pendingMessages.get(ack.messageId);
    if (pending) {
      pending.resolve();
      this.pendingMessages.delete(ack.messageId);
    }
  }

  // ─── Sending Messages ───────────────────────────────────────────────────

  /**
   * Send an encrypted message via the relay.
   * Returns a promise that resolves when the message is acknowledged.
   */
  async sendEncryptedMessage(envelope: EncryptedEnvelope): Promise<void> {
    if (!this.isConnected) {
      await this.connect();
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingMessages.delete(envelope.messageId);
        reject(new Error('Message send timeout'));
      }, 30000);

      this.pendingMessages.set(envelope.messageId, {
        envelope,
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      try {
        // Send in the format expected by relay backend:
        // { type: 'relay.envelope', payload: { type, to, content, timestamp, moderation } }
        this.ws!.send(JSON.stringify({
          type: 'relay.envelope',
          payload: {
            type: 'message',
            to: envelope.recipientId,
            content: JSON.stringify(envelope),
            timestamp: envelope.timestamp,
          },
        }));
      } catch (error) {
        clearTimeout(timeout);
        this.pendingMessages.delete(envelope.messageId);
        reject(error);
      }
    });
  }

  /**
   * Send a typing indicator.
   */
  sendTyping(chatId: string, isTyping: boolean): void {
    if (!this.isConnected || !this.ws) return;

    this.ws.send(JSON.stringify({
      type: isTyping ? 'typing.start' : 'typing.stop',
      chatId,
    }));
  }

  /**
   * Send a read receipt.
   */
  sendReadReceipt(messageId: string, chatId: string): void {
    if (!this.isConnected || !this.ws) return;

    this.ws.send(JSON.stringify({
      type: 'message_read',
      messageId,
      chatId,
    }));
  }

  // ─── Pre-Key Bundle Management ──────────────────────────────────────────

  /**
   * Upload pre-key bundle to the relay.
   */
  async uploadPreKeyBundle(bundle: PreKeyBundle): Promise<void> {
    const serialized = serializePreKeyBundle(bundle);

    // Convert from client SerializedPreKeyBundle to relay PreKeyUploadBody format
    const relayBody = {
      identityKey: serialized.identityKey,
      signedPreKey: serialized.signedPreKey.publicKey,
      signature: serialized.signedPreKey.signature,
      oneTimePreKeys: serialized.oneTimePreKeys.map(k => k.publicKey),
    };

    const response = await this.fetchWithRelayAuth(`${this.config.httpBaseUrl}/api/keys/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(relayBody),
    });

    if (!response.ok) {
      throw new Error(`Failed to upload pre-key bundle: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Fetch a user's pre-key bundle from the relay.
   */
  async fetchPreKeyBundle(userId: string): Promise<PreKeyBundle | null> {
    const response = await this.fetchWithRelayAuth(`${this.config.httpBaseUrl}/api/keys/${userId}`);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch pre-key bundle: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as Record<string, unknown>;

    // Normalize relay API response to match SerializedPreKeyBundle format
    // Server may return `preKeyId` instead of `keyId` for one-time pre-keys
    const rawOtpks = Array.isArray(data.oneTimePreKeys) ? data.oneTimePreKeys : [];
    const normalizedBundle: SerializedPreKeyBundle = {
      identityKey: String(data.identityKey || ''),
      signedPreKey: {
        keyId: (data.signedPreKey as any)?.keyId ?? 0,
        publicKey: String((data.signedPreKey as any)?.publicKey || ''),
        signature: String((data.signedPreKey as any)?.signature || ''),
      },
      oneTimePreKeys: rawOtpks.map((k: any) => ({
        keyId: k.keyId ?? k.preKeyId ?? 0,
        publicKey: String(k.publicKey || ''),
      })),
    };

    return deserializePreKeyBundle(normalizedBundle);
  }

  // ─── Event System ───────────────────────────────────────────────────────

  /**
   * Subscribe to relay events.
   */
  on(handler: RelayEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Emit an event to all handlers.
   */
  private emit(event: RelayEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('[RelayE2EClient] Event handler error:', error);
      }
    }
  }

  // ─── Status ─────────────────────────────────────────────────────────────

  /**
   * Check if connected to the relay.
   */
  get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Get connection status.
   */
  getStatus(): {
    connected: boolean;
    connecting: boolean;
    reconnectAttempts: number;
    pendingMessages: number;
  } {
    return {
      connected: this.isConnected,
      connecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      pendingMessages: this.pendingMessages.size,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

export const relayClient = new RelayE2EClient();
