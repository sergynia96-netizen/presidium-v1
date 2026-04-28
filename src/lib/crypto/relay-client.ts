/**
 * Relay E2E Client
 *
 * HTTP + WebSocket client for the production relay backend.
 * Bridges the client-side E2E envelope model to the relay chat protocol.
 */

/*
 * CHANGELOG
 * 2026-04-28:
 * - Added outgoing adapter: EncryptedEnvelope -> production `chat.message`.
 * - Added `chat.ack` support so backend acknowledgements resolve pending sends.
 * - Kept the E2E envelope opaque: relay receives JSON inside `encryptedPayload`.
 *
 * 2026-04-17:
 * - Added stronger auth backoff and auth-error classification.
 * - Added cooldown on `/api/relay/token` auth failures (401/403) to stop retry storms.
 * - Prevented endless reconnect loops when token/auth is invalid.
 */

import { clearRelayAccessToken, getRelayAccessToken, setRelayAccessToken } from '../relay-auth';
import { getWebSocketManager, type WebSocketManager } from '../websocket-manager';
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

export type RelayMessageEnvelope = EncryptedEnvelope;

export interface RelayAckMessage {
  type: 'ack';
  messageId: string;
  receivedAt: number;
}

export interface RelayChatAckMessage {
  type: 'chat.ack';
  payload: {
    messageId?: string;
    clientId?: string;
    status?: string;
    deliveredCount?: number;
    offlineCount?: number;
    totalMembers?: number;
    processingTimeMs?: number;
  };
  timestamp?: number;
}

export interface RelayChatMessage {
  type: 'chat.message';
  payload: {
    id: string;
    chatId: string;
    senderId: string;
    encryptedPayload: string;
    nonce: string;
    type?: string;
    replyTo?: string;
    createdAt?: number;
    clientTimestamp?: number;
  };
  timestamp?: number;
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
  | RelayChatMessage
  | RelayAckMessage
  | RelayChatAckMessage
  | RelayTypingMessage
  | RelayPresenceMessage
  | { type: 'pong' }
  | { type: 'connected' }
  | { type: 'auth.success'; payload?: Record<string, unknown> }
  | { type: 'auth.required'; payload?: Record<string, unknown> }
  | { type: 'auth.error'; payload?: { error?: string; message?: string } }
  | { type: 'error'; message?: string; payload?: { message?: string; code?: string } };

export type RelayEvent =
  | { type: 'message'; data: RelayMessageEnvelope }
  | { type: 'ack'; data: RelayAckMessage }
  | { type: 'typing'; data: RelayTypingMessage }
  | { type: 'presence'; data: RelayPresenceMessage }
  | { type: 'connected' }
  | { type: 'disconnected'; reason: string }
  | { type: 'error'; error: Error };

export type RelayEventHandler = (event: RelayEvent) => void;

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

function parseRelayChatMessage(message: RelayChatMessage): RelayMessageEnvelope | null {
  try {
    const envelope = JSON.parse(message.payload.encryptedPayload) as RelayMessageEnvelope;
    if (envelope?.type !== 'encrypted-message' || envelope.version !== 1) {
      return null;
    }
    return envelope;
  } catch {
    return null;
  }
}

class RelayE2EClient {
  private config: RelayConfig;
  private wsManager: WebSocketManager | null = null;
  private handlers = new Set<RelayEventHandler>();
  private pendingMessages = new Map<string, { envelope: EncryptedEnvelope; resolve: () => void; reject: (error: Error) => void }>();
  private authRetryAt = 0;
  private isConnected = false;
  private isConnecting = false;
  private pendingConnectResolver: (() => void) | null = null;
  private pendingConnectRejecter: ((error: Error) => void) | null = null;
  private unsubscribeMessage: (() => void) | null = null;
  private unsubscribeState: (() => void) | null = null;

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

  private resolvePendingConnect(): void {
    const resolve = this.pendingConnectResolver;
    this.pendingConnectResolver = null;
    this.pendingConnectRejecter = null;
    if (resolve) resolve();
  }

  private rejectPendingConnect(error: Error): void {
    const reject = this.pendingConnectRejecter;
    this.pendingConnectResolver = null;
    this.pendingConnectRejecter = null;
    if (reject) reject(error);
  }

  private isJwtExpired(token: string): boolean {
    try {
      const [, payloadBase64] = token.split('.');
      if (!payloadBase64) return true;
      const payloadJson = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson) as { exp?: number };
      if (typeof payload.exp !== 'number') return false;
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

      void (async () => {
        try {
          this.wsManager = getWebSocketManager(this.config.wsBaseUrl);

          this.unsubscribeMessage = this.wsManager.onMessage((raw) => {
            this.handleMessage(JSON.stringify(raw));
          });

          this.unsubscribeState = this.wsManager.onStateChange((state) => {
            if (state === 'connected') {
              void this.authenticate();
            } else if (state === 'disconnected') {
              this.isConnected = false;
              this.isConnecting = false;
              this.emit({ type: 'disconnected', reason: 'Connection closed' });
            }
          });

          await this.wsManager.connect();
        } catch (error) {
          this.isConnecting = false;
          this.rejectPendingConnect(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });
  }

  private async authenticate(): Promise<void> {
    try {
      const token = await this.ensureRelayToken();
      console.log(`[RelayE2EClient] Token: ${token ? `present (${token.length} chars)` : 'missing'}`);

      const sent = this.wsManager?.send({ type: 'auth', payload: { token } });
      if (!sent) {
        throw new Error('Failed to send auth payload');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthRelatedMessage(message)) {
        this.activateAuthRetryBackoff();
      }
      this.isConnecting = false;
      this.rejectPendingConnect(error instanceof Error ? error : new Error(message));
    }
  }

  disconnect(): void {
    this.pendingConnectResolver = null;
    this.pendingConnectRejecter = null;

    if (this.unsubscribeMessage) {
      this.unsubscribeMessage();
      this.unsubscribeMessage = null;
    }
    if (this.unsubscribeState) {
      this.unsubscribeState();
      this.unsubscribeState = null;
    }

    this.wsManager = null;
    this.isConnected = false;
    this.isConnecting = false;
  }

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
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  private handleMessage(data: string): void {
    try {
      const parsed = JSON.parse(data) as RelayIncomingMessage;

      switch (parsed.type) {
        case 'encrypted-message':
          this.emit({ type: 'message', data: parsed as RelayMessageEnvelope });
          break;

        case 'chat.message': {
          const envelope = parseRelayChatMessage(parsed as RelayChatMessage);
          if (!envelope) {
            this.emit({ type: 'error', error: new Error('Invalid encrypted relay chat payload') });
            break;
          }
          this.emit({ type: 'message', data: envelope });
          break;
        }

        case 'ack':
          this.emit({ type: 'ack', data: parsed as RelayAckMessage });
          this.handleAck(parsed as RelayAckMessage);
          break;

        case 'chat.ack': {
          const ack = parsed as RelayChatAckMessage;
          const messageId = ack.payload.clientId || ack.payload.messageId;
          if (!messageId) {
            this.emit({ type: 'error', error: new Error('Relay chat acknowledgement is missing message id') });
            break;
          }
          const normalizedAck: RelayAckMessage = {
            type: 'ack',
            messageId,
            receivedAt: ack.timestamp || Date.now(),
          };
          this.emit({ type: 'ack', data: normalizedAck });
          this.handleAck(normalizedAck);
          break;
        }

        case 'typing':
          this.emit({ type: 'typing', data: parsed as RelayTypingMessage });
          break;

        case 'presence':
          this.emit({ type: 'presence', data: parsed as RelayPresenceMessage });
          break;

        case 'pong':
        case 'auth.required':
          break;

        case 'connected':
        case 'auth.success':
          this.isConnected = true;
          this.isConnecting = false;
          this.clearAuthRetryBackoff();
          this.resolvePendingConnect();
          this.emit({ type: 'connected' });
          console.log('[RelayE2EClient] Auth response:', JSON.stringify(parsed));
          break;

        case 'auth.error': {
          const errorMessage = parsed.payload?.message || parsed.payload?.error || 'Relay authentication failed';
          clearRelayAccessToken();
          this.activateAuthRetryBackoff();
          this.isConnected = false;
          this.isConnecting = false;
          this.rejectPendingConnect(new Error(String(errorMessage)));
          this.emit({ type: 'error', error: new Error(String(errorMessage)) });
          break;
        }

        case 'error': {
          const errorMessage = parsed.message || parsed.payload?.message || 'Relay error';
          const errorCode = parsed.payload?.code;
          console.log('[RelayE2EClient] Error response:', JSON.stringify(parsed));

          if (errorCode === 'auth_required' || /auth|token|unauthorized/i.test(String(errorMessage))) {
            clearRelayAccessToken();
            this.activateAuthRetryBackoff();
            this.isConnected = false;
            this.isConnecting = false;
            this.rejectPendingConnect(new Error(String(errorMessage)));
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

  /**
   * Send an encrypted message via the production relay chat protocol.
   * The E2E envelope remains opaque to the relay and is stored inside encryptedPayload.
   */
  async sendEncryptedMessage(chatId: string, envelope: EncryptedEnvelope): Promise<void> {
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

      const sent = this.wsManager?.send({
        type: 'chat.message',
        payload: {
          chatId,
          encryptedPayload: JSON.stringify(envelope),
          nonce: envelope.iv,
          type: 'text',
          clientTimestamp: envelope.timestamp,
          id: envelope.messageId,
        },
      });

      if (!sent) {
        clearTimeout(timeout);
        this.pendingMessages.delete(envelope.messageId);
        reject(new Error('Failed to send message: WebSocket not connected'));
      }
    });
  }

  sendTyping(chatId: string, isTyping: boolean): void {
    if (!this.isConnected) return;

    this.wsManager?.send({
      type: isTyping ? 'typing.start' : 'typing.stop',
      chatId,
    });
  }

  sendReadReceipt(messageId: string, chatId: string): void {
    if (!this.isConnected) return;

    this.wsManager?.send({
      type: 'message_read',
      messageId,
      chatId,
    });
  }

  async uploadPreKeyBundle(bundle: PreKeyBundle): Promise<void> {
    const serialized = serializePreKeyBundle(bundle);

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

  async fetchPreKeyBundle(userId: string): Promise<PreKeyBundle | null> {
    const response = await this.fetchWithRelayAuth(`${this.config.httpBaseUrl}/api/keys/${userId}`);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch pre-key bundle: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as Record<string, unknown>;

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

  on(handler: RelayEventHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  private emit(event: RelayEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('[RelayE2EClient] Event handler error:', error);
      }
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }

  getStatus(): {
    connected: boolean;
    connecting: boolean;
    pendingMessages: number;
  } {
    return {
      connected: this.isConnected,
      connecting: this.isConnecting,
      pendingMessages: this.pendingMessages.size,
    };
  }
}

export const relayClient = new RelayE2EClient();
