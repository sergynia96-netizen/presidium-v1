// ─── Session Manager ───────────────────────────────
// Tracks connected WebSocket clients and routes messages

import WebSocket from 'ws';
import {
  cleanupSessionPresenceIndex,
  removeSessionPresence,
  touchSessionPresence,
  upsertSessionPresence,
} from './distributed-state';

interface ClientConnection {
  ws: WebSocket;
  accountId: string;
  connectedAt: number;
  lastPing: number;
}

class SessionManager {
  private clients: Map<string, ClientConnection> = new Map();
  private readonly nodeId = process.env.RELAY_NODE_ID || `${process.pid}`;

  register(accountId: string, ws: WebSocket): void {
    // Close existing connection for this account
    this.unregister(accountId);

    const client: ClientConnection = {
      ws,
      accountId,
      connectedAt: Date.now(),
      lastPing: Date.now(),
    };

    this.clients.set(accountId, client);
    void upsertSessionPresence({
      accountId,
      nodeId: this.nodeId,
      connectedAt: client.connectedAt,
      lastPing: client.lastPing,
    });
    console.log(`[SESSION] ${accountId} connected (${this.clients.size} total)`);
  }

  unregister(accountId: string): void {
    const client = this.clients.get(accountId);
    if (client) {
      try {
        client.ws.close(1000, 'Session ended');
      } catch {
        // ignore
      }
      this.clients.delete(accountId);
      void removeSessionPresence(accountId);
      console.log(`[SESSION] ${accountId} disconnected (${this.clients.size} total)`);
    }
  }

  get(accountId: string): ClientConnection | undefined {
    return this.clients.get(accountId);
  }

  isConnected(accountId: string): boolean {
    const client = this.clients.get(accountId);
    return !!client && client.ws.readyState === WebSocket.OPEN;
  }

  getAll(): Map<string, ClientConnection> {
    return this.clients;
  }

  getOnlineIds(): string[] {
    return Array.from(this.clients.keys());
  }

  size(): number {
    return this.clients.size;
  }

  // Send message to specific account
  sendTo(accountId: string, message: object): boolean {
    const client = this.clients.get(accountId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) return false;

    try {
      client.ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }

  // Broadcast to all connected clients
  broadcast(message: object, excludeId?: string): void {
    const data = JSON.stringify(message);
    for (const [id, client] of this.clients) {
      if (id === excludeId) continue;
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      try {
        client.ws.send(data);
      } catch {
        // ignore
      }
    }
  }

  // Update last ping time
  ping(accountId: string): void {
    const client = this.clients.get(accountId);
    if (client) {
      client.lastPing = Date.now();
      void touchSessionPresence(accountId, client.lastPing);
    }
  }

  // Clean up stale connections (not responding to pings)
  cleanupStale(timeoutMs: number = 60000): string[] {
    const now = Date.now();
    const stale: string[] = [];

    for (const [id, client] of this.clients) {
      if (now - client.lastPing > timeoutMs) {
        stale.push(id);
        this.unregister(id);
      }
    }

    return stale;
  }

  async cleanupDistributed(): Promise<number> {
    return cleanupSessionPresenceIndex();
  }
}

export const sessionManager = new SessionManager();
