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

import { getRelayHttpBaseUrl } from '../relay-base-url';
import { getRelayAccessToken } from '../relay-auth';
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
  httpBaseUrl: getRelayHttpBaseUrl(),
  wsBaseUrl: (process.env.NEXT_PUBLIC_RELAY_WS_URL || 'ws://127.0.0.1:3001').replace(/\/+$/, ''),
  reconnectIntervalMs: 1000,
  maxReconnectIntervalMs: 30000,
  maxReconnectAttempts: 10,
  pingIntervalMs: 30000,
  pongTimeoutMs: 10000,
};

function resolveRelayWebSocketUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  try {
    const parsed = new URL(trimmed);
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = '/ws';
    } else if (!parsed.pathname.endsWith('/ws')) {
      parsed.pathname = `${parsed.pathname.replace(/\/+$/, '')}/ws`;
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

  constructor(config: Partial<RelayConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ─── Connection Management ──────────────────────────────────────────────

  /**
   * Connect to the relay via WebSocket.
   */
  connect(): Promise<void> {
    if (this.isConnected) return Promise.resolve();
    if (this.isConnecting) return this.waitForConnection();

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        const wsUrl = resolveRelayWebSocketUrl(this.config.wsBaseUrl);
        const token = getRelayAccessToken();

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;

          // Authenticate
          if (token) {
            this.ws!.send(JSON.stringify({ type: 'auth', token }));
          }

          // Start ping
          this.startPing();

          this.emit({ type: 'connected' });
          resolve();
        };

        this.ws.onclose = (event) => {
          this.isConnected = false;
          this.isConnecting = false;
          this.stopPing();

          this.emit({ type: 'disconnected', reason: event.reason || 'Connection closed' });

          // Attempt reconnection
          if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = (error) => {
          this.isConnecting = false;
          this.emit({ type: 'error', error: new Error('WebSocket error') });
          reject(error);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the relay.
   */
  disconnect(): void {
    this.stopPing();
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
    return new Promise((resolve) => {
      const check = () => {
        if (this.isConnected) {
          resolve();
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
          // Already handled in onopen
          break;

        case 'error':
          this.emit({ type: 'error', error: new Error((parsed as any).message || 'Relay error') });
          break;

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
        this.ws!.send(JSON.stringify({
          type: 'relay.envelope',
          to: envelope.recipientId,
          payload: envelope,
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
    const token = getRelayAccessToken();

    // Convert from client SerializedPreKeyBundle to relay PreKeyUploadBody format
    const relayBody = {
      identityKey: serialized.identityKey,
      signedPreKey: serialized.signedPreKey.publicKey,
      signature: serialized.signedPreKey.signature,
      oneTimePreKeys: serialized.oneTimePreKeys.map(k => k.publicKey),
    };

    const response = await fetch(`${this.config.httpBaseUrl}/api/keys/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
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
    const token = getRelayAccessToken();

    const response = await fetch(`${this.config.httpBaseUrl}/api/keys/${userId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

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
