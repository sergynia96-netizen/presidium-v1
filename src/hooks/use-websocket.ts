'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '@/store/use-app-store';

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

const RELAY_ACCESS_TOKEN_KEY = 'presidium_access_token';

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
    enabled = true,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const connectRef = useRef<() => void>(() => undefined);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const manualCloseRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [readyState, setReadyState] = useState(0);
  const relayWsUrl = process.env.NEXT_PUBLIC_RELAY_WS_URL;

  const resolvePrivateRecipient = useCallback((chatId: string, payload?: unknown): string | null => {
    const state = useAppStore.getState();
    const currentUserId = state.user?.id;
    const chat = state.chats.find((entry) => entry.id === chatId);

    if (chat?.members && currentUserId) {
      const peer = chat.members.find((memberId) => memberId !== currentUserId);
      if (peer) return peer;
    }

    if (payload && typeof payload === 'object') {
      const record = payload as Record<string, unknown>;
      if (typeof record.to === 'string' && record.to.trim()) {
        return record.to.trim();
      }
      if (typeof record.recipientId === 'string' && record.recipientId.trim()) {
        return record.recipientId.trim();
      }
    }

    return null;
  }, []);

  const getStoredRelayToken = useCallback(() => {
    if (typeof window === 'undefined') return null;
    return (
      localStorage.getItem(RELAY_ACCESS_TOKEN_KEY) ||
      localStorage.getItem('next-auth.session-token') ||
      localStorage.getItem('auth-token')
    );
  }, []);

  const fetchRelayTokenFromSession = useCallback(async () => {
    if (typeof window === 'undefined') return null;

    try {
      const res = await fetch('/api/relay/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) return null;

      const data = (await res.json()) as { token?: string };
      const token = data.token?.trim();
      if (!token) return null;

      localStorage.setItem(RELAY_ACCESS_TOKEN_KEY, token);
      return token;
    } catch {
      return null;
    }
  }, []);

  const resolveRelayWsBaseUrl = useCallback(() => {
    if (typeof window === 'undefined') {
      return relayWsUrl?.trim() || 'ws://localhost:3001/ws';
    }

    const fallback = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:3001/ws`;
    const raw = relayWsUrl?.trim();

    if (!raw) return fallback;

    try {
      const parsed = new URL(raw);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        parsed.hostname = window.location.hostname;
      }
      return parsed.toString();
    } catch {
      return raw
        .replace('localhost', window.location.hostname)
        .replace('127.0.0.1', window.location.hostname);
    }
  }, [relayWsUrl]);

  const connect = useCallback(async () => {
    if (!enabled) return;
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    try {
      let token = getStoredRelayToken();
      if (!token) {
        token = await fetchRelayTokenFromSession();
      }

      if (!token) {
        setIsConnected(false);
        setReadyState(WebSocket.CLOSED);
        return;
      }

      const wsBaseUrl = resolveRelayWsBaseUrl();
      const ws = new WebSocket(wsBaseUrl);
      setReadyState(WebSocket.CONNECTING);
      manualCloseRef.current = false;

      ws.onopen = () => {
        setReadyState(WebSocket.OPEN);
        setIsConnected(false);
        ws.send(
          JSON.stringify({
            type: 'auth',
            payload: { token },
            timestamp: new Date().toISOString(),
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          if (message.type === 'connected') {
            setIsConnected(true);
            reconnectAttemptsRef.current = 0;
            onConnect?.();
          }
          onMessage?.(message);
        } catch (error) {
          console.error('[WS] Message parse error:', error);
        }
      };

      ws.onclose = (event) => {
        wsRef.current = null;
        setIsConnected(false);
        setReadyState(WebSocket.CLOSED);
        onDisconnect?.();

        if (manualCloseRef.current || !enabled) {
          return;
        }

        if (event.code === 4001 && typeof window !== 'undefined') {
          localStorage.removeItem(RELAY_ACCESS_TOKEN_KEY);
        }

        // Attempt to reconnect
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          console.warn(`[WS] Reconnecting... (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectRef.current();
          }, reconnectInterval);
        } else {
          console.error('[WS] Max reconnect attempts reached');
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        onError?.(error);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('[WS] Connection error:', error);
      onError?.(error as Event);
    }
  }, [
    fetchRelayTokenFromSession,
    getStoredRelayToken,
    maxReconnectAttempts,
    onConnect,
    onDisconnect,
    onError,
    onMessage,
    enabled,
    reconnectInterval,
    resolveRelayWsBaseUrl,
  ]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    manualCloseRef.current = true;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setReadyState(WebSocket.CLOSED);
  }, []);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && isConnected) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    console.warn('[WS] Cannot send message: WebSocket is not open');
    return false;
  }, [isConnected]);

  const joinChat = useCallback((chatId: string) => {
    // Relay v2 does not use room join/leave semantics for direct routing.
    // Keep this as a no-op success for compatibility with existing UI flow.
    return Boolean(chatId);
  }, []);

  const leaveChat = useCallback((chatId: string) => {
    // Relay v2 does not use room join/leave semantics for direct routing.
    // Keep this as a no-op success for compatibility with existing UI flow.
    return Boolean(chatId);
  }, []);

  const sendTyping = useCallback((chatId: string, isTyping: boolean) => {
    const to = resolvePrivateRecipient(chatId);
    if (!to) return false;

    return sendMessage({
      type: isTyping ? 'typing.start' : 'typing.stop',
      payload: { to },
      chatId,
      timestamp: new Date().toISOString(),
    });
  }, [resolvePrivateRecipient, sendMessage]);

  const sendMessageToChat = useCallback((chatId: string, payload: unknown) => {
    const state = useAppStore.getState();
    const chat = state.chats.find((entry) => entry.id === chatId);
    const content =
      typeof payload === 'string'
        ? payload
        : JSON.stringify(payload ?? {});

    if (chat?.type === 'group') {
      return sendMessage({
        type: 'relay.group_envelope',
        payload: {
          groupId: chatId,
          type: 'message',
          content,
        },
        chatId,
        timestamp: new Date().toISOString(),
      });
    }

    const to = resolvePrivateRecipient(chatId, payload);
    if (!to) return false;

    return sendMessage({
      type: 'relay.envelope',
      payload: {
        type: 'message',
        to,
        content,
      },
      chatId,
      timestamp: new Date().toISOString(),
    });
  }, [resolvePrivateRecipient, sendMessage]);

  const sendReadReceipt = useCallback((chatId: string, messageId: string) => {
    const state = useAppStore.getState();
    const chat = state.chats.find((entry) => entry.id === chatId);

    const content = JSON.stringify({
      kind: 'read_receipt',
      chatId,
      messageId,
      readAt: new Date().toISOString(),
    });

    const rawChatType = (chat as { type?: unknown } | undefined)?.type;
    const chatType = typeof rawChatType === 'string' ? rawChatType : 'private';
    if (chatType === 'group') {
      return sendMessage({
        type: 'relay.group_envelope',
        payload: {
          groupId: chatId,
          type: 'message',
          content,
        },
        chatId,
        timestamp: new Date().toISOString(),
      });
    }

    if (chatType === 'channel') {
      return sendMessage({
        type: 'relay.channel_envelope',
        payload: {
          channelId: chatId,
          type: 'message',
          content,
        },
        chatId,
        timestamp: new Date().toISOString(),
      });
    }

    const to = resolvePrivateRecipient(chatId);
    if (!to) return false;

    return sendMessage({
      type: 'relay.envelope',
      payload: {
        type: 'message',
        to,
        content,
      },
      chatId,
      timestamp: new Date().toISOString(),
    });
  }, [resolvePrivateRecipient, sendMessage]);

  useEffect(() => {
    if (!enabled) return;

    const initialAttempt = setTimeout(() => {
      connectRef.current();
    }, 0);
    const interval = setInterval(() => {
      if (!wsRef.current && !isConnected) {
        connectRef.current();
      }
    }, 5000);

    return () => {
      clearTimeout(initialAttempt);
      clearInterval(interval);
      disconnect();
    };
  }, [disconnect, enabled, isConnected]);

  return {
    isConnected,
    readyState,
    sendMessage,
    joinChat,
    leaveChat,
    sendTyping,
    sendMessageToChat,
    sendReadReceipt,
    disconnect,
  };
}

export default useWebSocket;
