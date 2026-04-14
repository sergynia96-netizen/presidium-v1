'use client';

/**
 * ⚠️ TEMPORARY: useWebSocket disabled to prevent double-WS connection loop.
 * 
 * PROBLEM: Both useWebSocket and RelayE2EClient were creating separate
 * WebSocket connections to the same relay server, causing:
 * - 8+ WS connections per second (reconnect loop)
 * - Server treating it as DDoS
 * - Quick disconnects (70ms)
 * 
 * SOLUTION: All WS communication now handled by RelayE2EClient
 * (src/lib/crypto/relay-client.ts). This hook returns dummy values
 * to maintain UI compatibility without creating connections.
 * 
 * TODO: Migrate to unified getWebSocketManager() singleton.
 * See: src/lib/websocket-manager.ts
 */

interface WebSocketMessage {
  type: string;
  payload: unknown;
  chatId?: string;
  senderId?: string;
  timestamp: string | number;
}

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  enabled?: boolean;
}

/**
 * Disabled WebSocket hook — returns no-op methods to prevent
 * duplicate WebSocket connections.
 * 
 * Real WS communication is handled by RelayE2EClient singleton.
 * UI components that depend on this hook will gracefully degrade.
 */
export function useWebSocket(_options: UseWebSocketOptions = {}) {
  // Return stub implementation to prevent double connections
  return {
    isConnected: false,
    readyState: WebSocket.CLOSED,
    sendMessage: (_message: WebSocketMessage) => false,
    joinChat: (chatId: string) => Boolean(chatId),
    leaveChat: (chatId: string) => Boolean(chatId),
    sendTyping: (_chatId: string, _isTyping: boolean) => false,
    sendMessageToChat: (_chatId: string, _payload: unknown) => false,
    sendReadReceipt: (_chatId: string, _messageId: string) => false,
    disconnect: () => {},
  };
}

export default useWebSocket;
