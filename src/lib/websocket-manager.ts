/**
 * Unified WebSocket Manager for Presidium
 * 
 * Single WebSocket connection shared between useWebSocket and RelayE2EClient.
 * Solves the problem of duplicate connections that caused:
 * - Race conditions in session manager
 * - Double delivery of queued messages
 * - Conflicting presence events
 * 
 * Features:
 * - Singleton pattern — only one WS connection per browser tab
 * - Exponential backoff reconnection (1s → 30s)
 * - Automatic ping/pong keepalive
 * - Pub/sub message distribution to multiple subscribers
 * - State change notifications
 * 
 * Usage:
 *   const manager = getWebSocketManager();
 *   await manager.connect();
 *   manager.onMessage(handleMessage);
 *   manager.send({ type: 'ping' });
 */

type WSMessageHandler = (data: unknown) => void;
type WSState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

interface WSConfig {
  url: string;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
  pingIntervalMs?: number;
}

class WebSocketManager {
  private ws: WebSocket | null = null;
  private config: WSConfig;
  private state: WSState = 'disconnected';
  private reconnectAttempts = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualDisconnect = false;

  // Subscribers
  private messageHandlers = new Set<WSMessageHandler>();
  private stateListeners = new Set<(state: WSState) => void>();

  constructor(config: WSConfig) {
    this.config = {
      reconnectIntervalMs: 1000,
      maxReconnectAttempts: 10,
      pingIntervalMs: 30000,
      ...config,
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────

  /**
   * Connect to the relay WebSocket endpoint.
   * Returns a promise that resolves when the connection is open.
   */
  connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.ws?.readyState === WebSocket.CONNECTING) {
      return this.waitForOpen();
    }

    this.manualDisconnect = false;

    return new Promise((resolve, reject) => {
      try {
        this.setState('connecting');

        console.log('[WSManager] Connecting to', this.config.url);
        this.ws = new WebSocket(this.config.url);

        this.ws.onopen = () => {
          console.log('[WSManager] Connected');
          this.setState('connected');
          this.reconnectAttempts = 0;
          this.startPing();
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.messageHandlers.forEach((handler) => handler(data));

            // Auto-respond to server pings
            if (data?.type === 'ping') {
              this.send({ type: 'pong', timestamp: Date.now() });
            }
          } catch (e) {
            console.error('[WSManager] Parse error:', e);
          }
        };

        this.ws.onclose = (event) => {
          console.warn(
            `[WSManager] Closed: code=${event.code}, reason=${event.reason}`,
          );
          this.ws = null;
          this.stopPing();
          this.setState('disconnected');

          if (!this.manualDisconnect) {
            this.scheduleReconnect();
          }
        };

        this.ws.onerror = () => {
          // onclose will fire after onerror, so reconnect is handled there
          reject(new Error('WebSocket error'));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send a message through the WebSocket.
   * Returns false if not connected.
   */
  send(data: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WSManager] Cannot send: not connected');
      return false;
    }

    try {
      this.ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('[WSManager] Send error:', error);
      return false;
    }
  }

  /**
   * Disconnect manually (won't trigger auto-reconnect).
   */
  disconnect(): void {
    this.manualDisconnect = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
    this.setState('disconnected');
  }

  getState(): WSState {
    return this.state;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get the number of active subscribers.
   */
  getSubscriberCount(): number {
    return this.messageHandlers.size;
  }

  // ─── Subscription API ────────────────────────────────────────────────

  /**
   * Subscribe to incoming messages.
   * Returns an unsubscribe function.
   */
  onMessage(handler: WSMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Subscribe to connection state changes.
   * Returns an unsubscribe function.
   * The listener is called immediately with the current state.
   */
  onStateChange(listener: (state: WSState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state); // Emit current state immediately
    return () => this.stateListeners.delete(listener);
  }

  // ─── Private Methods ─────────────────────────────────────────────────

  private setState(state: WSState): void {
    this.state = state;
    this.stateListeners.forEach((listener) => listener(state));
  }

  private waitForOpen(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          resolve();
        } else if (this.ws?.readyState === WebSocket.CLOSED) {
          // Connection failed, try to reconnect
          this.connect().then(resolve).catch(() => resolve());
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (!this.isConnected()) return;
      this.send({ type: 'ping', timestamp: Date.now() });
    }, this.config.pingIntervalMs);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts!) {
      console.error(
        `[WSManager] Max reconnect attempts reached (${this.config.maxReconnectAttempts})`,
      );
      this.setState('disconnected');
      return;
    }

    const delay = Math.min(
      this.config.reconnectIntervalMs! * Math.pow(2, this.reconnectAttempts),
      30000, // Max 30s
    );

    this.reconnectAttempts++;
    this.setState('reconnecting');

    console.log(
      `[WSManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        console.error('[WSManager] Reconnect failed:', err);
      });
    }, delay);
  }

  private clearTimers(): void {
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────

let wsManagerInstance: WebSocketManager | null = null;

/**
 * Get or create the singleton WebSocketManager.
 * The first call initializes the manager with the relay WebSocket URL.
 * Subsequent calls return the same instance.
 */
export function getWebSocketManager(url?: string): WebSocketManager {
  if (!wsManagerInstance) {
    const wsUrl =
      url ||
      (typeof window !== 'undefined'
        ? process.env.NEXT_PUBLIC_RELAY_WS_URL || 'ws://127.0.0.1:3001/ws'
        : 'ws://127.0.0.1:3001/ws');

    wsManagerInstance = new WebSocketManager({ url: wsUrl });
  }
  return wsManagerInstance;
}

/**
 * Reset the singleton instance (useful for testing or reconfiguration).
 */
export function resetWebSocketManager(): void {
  if (wsManagerInstance) {
    wsManagerInstance.disconnect();
    wsManagerInstance = null;
  }
}

export { WebSocketManager };
export type { WSConfig, WSState, WSMessageHandler };
