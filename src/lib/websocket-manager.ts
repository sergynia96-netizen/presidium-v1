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
 */

type WSMessageHandler = (data: unknown) => void;
type WSState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

interface WSConfig {
  url: string;
  reconnectIntervalMs?: number;
  maxReconnectAttempts?: number;
  pingIntervalMs?: number;
  openTimeoutMs?: number;
}

class WebSocketManager {
  private ws: WebSocket | null = null;
  private config: Required<WSConfig>;
  private state: WSState = 'disconnected';
  private reconnectAttempts = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualDisconnect = false;

  private messageHandlers = new Set<WSMessageHandler>();
  private stateListeners = new Set<(state: WSState) => void>();

  constructor(config: WSConfig) {
    this.config = {
      reconnectIntervalMs: 1000,
      maxReconnectAttempts: 10,
      pingIntervalMs: 30000,
      openTimeoutMs: 10000,
      ...config,
    };
  }

  /**
   * Connect to the relay WebSocket endpoint.
   * Resolves only after the browser socket reaches OPEN.
   */
  connect(): Promise<void> {
    if (typeof WebSocket === 'undefined') {
      return Promise.reject(new Error('WebSocket is not available in this runtime'));
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    if (this.ws?.readyState === WebSocket.CONNECTING) {
      return this.waitForOpen();
    }

    this.manualDisconnect = false;
    this.clearReconnectTimer();

    return new Promise((resolve, reject) => {
      let settled = false;
      const settleResolve = () => {
        if (settled) return;
        settled = true;
        clearTimeout(openTimeout);
        resolve();
      };
      const settleReject = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(openTimeout);
        reject(error);
      };

      const openTimeout = setTimeout(() => {
        const socket = this.ws;
        if (socket && socket.readyState === WebSocket.CONNECTING) {
          socket.close(1000, 'Open timeout');
        }
        settleReject(new Error(`WebSocket open timeout after ${this.config.openTimeoutMs}ms`));
      }, this.config.openTimeoutMs);

      try {
        this.setState('connecting');

        console.log('[WSManager] Connecting to', this.config.url);
        const socket = new WebSocket(this.config.url);
        this.ws = socket;

        socket.onopen = () => {
          if (this.ws !== socket) return;

          console.log('[WSManager] Connected');
          this.setState('connected');
          this.reconnectAttempts = 0;
          this.startPing();
          settleResolve();
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.messageHandlers.forEach((handler) => handler(data));

            if (data?.type === 'ping') {
              this.send({ type: 'pong', timestamp: Date.now() });
            }
          } catch (error) {
            console.error('[WSManager] Parse error:', error);
          }
        };

        socket.onclose = (event) => {
          if (this.ws !== socket) return;

          console.warn(`[WSManager] Closed: code=${event.code}, reason=${event.reason}`);
          this.ws = null;
          this.stopPing();
          this.setState('disconnected');

          if (!settled) {
            settleReject(new Error(`WebSocket closed before open: code=${event.code}`));
          }

          if (!this.manualDisconnect) {
            this.scheduleReconnect();
          }
        };

        socket.onerror = () => {
          if (this.ws !== socket) return;
          settleReject(new Error('WebSocket error'));
        };
      } catch (error) {
        settleReject(error instanceof Error ? error : new Error(String(error)));
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
   * Disconnect manually. This cancels reconnect attempts.
   */
  disconnect(): void {
    this.manualDisconnect = true;
    this.clearTimers();

    const socket = this.ws;
    this.ws = null;
    if (socket && socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING) {
      socket.close(1000, 'Manual disconnect');
    }

    this.setState('disconnected');
  }

  getState(): WSState {
    return this.state;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getSubscriberCount(): number {
    return this.messageHandlers.size;
  }

  onMessage(handler: WSMessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStateChange(listener: (state: WSState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  private setState(state: WSState): void {
    if (this.state === state) return;
    this.state = state;
    this.stateListeners.forEach((listener) => listener(state));
  }

  private waitForOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const check = () => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          resolve();
          return;
        }

        if (!this.ws || this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
          reject(new Error('WebSocket connection closed before open'));
          return;
        }

        if (Date.now() - startedAt > this.config.openTimeoutMs) {
          reject(new Error(`WebSocket open timeout after ${this.config.openTimeoutMs}ms`));
          return;
        }

        setTimeout(check, 100);
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
    if (this.manualDisconnect) return;
    if (this.reconnectTimer) return;

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error(`[WSManager] Max reconnect attempts reached (${this.config.maxReconnectAttempts})`);
      this.setState('disconnected');
      return;
    }

    const delay = Math.min(
      this.config.reconnectIntervalMs * Math.pow(2, this.reconnectAttempts),
      30000,
    );

    this.reconnectAttempts += 1;
    this.setState('reconnecting');

    console.log(
      `[WSManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts})`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((err) => {
        console.error('[WSManager] Reconnect failed:', err);
        this.scheduleReconnect();
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopPing();
    this.clearReconnectTimer();
  }
}

let wsManagerInstance: WebSocketManager | null = null;

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

export function resetWebSocketManager(): void {
  if (wsManagerInstance) {
    wsManagerInstance.disconnect();
    wsManagerInstance = null;
  }
}

export { WebSocketManager };
export type { WSConfig, WSState, WSMessageHandler };
