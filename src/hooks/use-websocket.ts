'use client';

/*
 * CHANGELOG (Codex)
 * 2026-04-17:
 * - Replaced disabled stub with a real singleton WebSocket hook using getWebSocketManager().
 * - Added relay auth handshake over WS (`type: "auth"`) after socket open.
 * - Added auth backoff to prevent 401/unauthorized reconnect storms.
 * - Preserved legacy API surface (sendMessageToChat/sendTyping/sendReadReceipt/joinChat/leaveChat)
 *   so existing chat/store integrations keep working.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getWebSocketManager, type WebSocketManager, type WSState } from '@/lib/websocket-manager';
import { clearRelayAccessToken, getRelayAccessToken, setRelayAccessToken } from '@/lib/relay-auth';

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

const AUTH_BACKOFF_MS = 30_000;
let authBlockedUntil = 0;
let authPromise: Promise<void> | null = null;

function mapStateToReadyState(state: WSState): number {
  if (state === 'connected') return WebSocket.OPEN;
  if (state === 'connecting' || state === 'reconnecting') return WebSocket.CONNECTING;
  return WebSocket.CLOSED;
}

function createErrorEvent(): Event {
  return new Event('error');
}

function parseIncomingMessage(raw: unknown): WebSocketMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  if (typeof data.type !== 'string') return null;

  const payload = data.payload;
  const payloadRecord = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;

  const directChatId = typeof data.chatId === 'string' ? data.chatId : '';
  const payloadChatId = typeof payloadRecord?.chatId === 'string' ? payloadRecord.chatId : '';
  const payloadGroupId = typeof payloadRecord?.groupId === 'string' ? payloadRecord.groupId : '';
  const payloadChannelId = typeof payloadRecord?.channelId === 'string' ? payloadRecord.channelId : '';
  const chatId = directChatId || payloadChatId || payloadGroupId || payloadChannelId || undefined;

  const senderId =
    typeof data.senderId === 'string'
      ? data.senderId
      : typeof payloadRecord?.from === 'string'
        ? payloadRecord.from
        : undefined;

  return {
    type: data.type,
    payload,
    chatId,
    senderId,
    timestamp:
      typeof data.timestamp === 'string' || typeof data.timestamp === 'number'
        ? data.timestamp
        : Date.now(),
  };
}

function isUnauthorizedRelayError(message: WebSocketMessage): boolean {
  if (message.type !== 'error') return false;
  const payload = message.payload && typeof message.payload === 'object'
    ? (message.payload as Record<string, unknown>)
    : null;
  const code = typeof payload?.code === 'string' ? payload.code : '';
  const text = typeof payload?.message === 'string' ? payload.message : '';
  return code === 'auth_required' || /auth|unauthorized|token/i.test(text);
}

async function ensureRelayToken(forceRefresh = false): Promise<string> {
  const cached = !forceRefresh ? getRelayAccessToken() : null;
  if (cached && cached.trim().length > 0) {
    return cached;
  }

  if (forceRefresh) {
    clearRelayAccessToken();
  }

  const response = await fetch('/api/relay/token', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      authBlockedUntil = Date.now() + AUTH_BACKOFF_MS;
      clearRelayAccessToken();
    }
    throw new Error(`Failed to get relay token (${response.status})`);
  }

  const json = (await response.json().catch(() => ({}))) as { token?: string };
  const token = typeof json.token === 'string' ? json.token : '';
  if (!token) {
    throw new Error('Relay token response is invalid');
  }

  setRelayAccessToken(token);
  return token;
}

async function authenticateRelaySocket(
  manager: WebSocketManager,
  forceRefresh = false,
): Promise<void> {
  if (Date.now() < authBlockedUntil) return;
  if (authPromise) {
    await authPromise;
    return;
  }

  authPromise = (async () => {
    const token = await ensureRelayToken(forceRefresh);
    const sent = manager.send({
      type: 'auth',
      payload: { token },
      timestamp: Date.now(),
    });
    if (!sent) {
      throw new Error('Relay WebSocket is not connected');
    }
  })().finally(() => {
    authPromise = null;
  });

  await authPromise;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const enabled = options.enabled !== false;

  const managerRef = useRef<WebSocketManager | null>(null);
  const hasRelayAuthRef = useRef(false);
  const hasConnectedOnceRef = useRef(false);

  const onMessageRef = useRef(options.onMessage);
  const onConnectRef = useRef(options.onConnect);
  const onDisconnectRef = useRef(options.onDisconnect);
  const onErrorRef = useRef(options.onError);

  const [isConnected, setIsConnected] = useState(false);
  const [readyState, setReadyState] = useState<number>(WebSocket.CLOSED);

  useEffect(() => {
    onMessageRef.current = options.onMessage;
    onConnectRef.current = options.onConnect;
    onDisconnectRef.current = options.onDisconnect;
    onErrorRef.current = options.onError;
  }, [options.onConnect, options.onDisconnect, options.onError, options.onMessage]);

  useEffect(() => {
    if (!enabled) {
      hasRelayAuthRef.current = false;
      hasConnectedOnceRef.current = false;
      setIsConnected(false);
      setReadyState(WebSocket.CLOSED);
      return;
    }

    const manager = getWebSocketManager();
    managerRef.current = manager;

    const unsubscribeState = manager.onStateChange((state) => {
      setReadyState(mapStateToReadyState(state));

      if (state === 'connected') {
        void authenticateRelaySocket(manager).catch(() => {
          onErrorRef.current?.(createErrorEvent());
        });
        return;
      }

      if (state === 'disconnected') {
        if (hasConnectedOnceRef.current) {
          onDisconnectRef.current?.();
        }
        hasRelayAuthRef.current = false;
        setIsConnected(false);
      }
    });

    const unsubscribeMessage = manager.onMessage((raw) => {
      const message = parseIncomingMessage(raw);
      if (!message) return;

      if (message.type === 'connected') {
        hasRelayAuthRef.current = true;
        hasConnectedOnceRef.current = true;
        authBlockedUntil = 0;
        setIsConnected(true);
        onConnectRef.current?.();
      } else if (isUnauthorizedRelayError(message)) {
        hasRelayAuthRef.current = false;
        setIsConnected(false);
        clearRelayAccessToken();
        authBlockedUntil = Date.now() + AUTH_BACKOFF_MS;
        onErrorRef.current?.(createErrorEvent());
      }

      onMessageRef.current?.(message);
    });

    manager
      .connect()
      .then(() => authenticateRelaySocket(manager))
      .catch(() => {
        onErrorRef.current?.(createErrorEvent());
      });

    return () => {
      unsubscribeMessage();
      unsubscribeState();
    };
  }, [enabled]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    const manager = managerRef.current;
    if (!manager || !manager.isConnected() || !hasRelayAuthRef.current) return false;

    return manager.send({
      type: message.type,
      payload: message.payload,
      chatId: message.chatId,
      senderId: message.senderId,
      timestamp: message.timestamp ?? Date.now(),
    });
  }, []);

  const send = useCallback((event: string, data: unknown) => {
    return sendMessage({
      type: event,
      payload: data,
      timestamp: Date.now(),
    });
  }, [sendMessage]);

  const on = useCallback((event: string, handler: (...args: unknown[]) => void) => {
    const manager = managerRef.current ?? getWebSocketManager();
    managerRef.current = manager;

    return manager.onMessage((raw) => {
      const message = parseIncomingMessage(raw);
      if (!message) return;
      if (message.type !== event) return;
      handler(message.payload, message);
    });
  }, []);

  const sendMessageToChat = useCallback((chatId: string, payload: unknown) => {
    if (!chatId) return false;

    let serializedPayload: string;
    try {
      serializedPayload =
        typeof payload === 'string' ? payload : JSON.stringify(payload);
    } catch {
      return false;
    }

    return sendMessage({
      type: 'relay.envelope',
      payload: {
        type: 'message',
        to: chatId,
        content: serializedPayload,
        timestamp: Date.now(),
      },
      chatId,
      timestamp: Date.now(),
    });
  }, [sendMessage]);

  const sendTyping = useCallback((chatId: string, isTyping: boolean) => {
    if (!chatId) return false;
    return sendMessage({
      type: isTyping ? 'typing.start' : 'typing.stop',
      payload: { to: chatId },
      chatId,
      timestamp: Date.now(),
    });
  }, [sendMessage]);

  const sendReadReceipt = useCallback((chatId: string, messageId: string) => {
    if (!chatId || !messageId) return false;
    return sendMessageToChat(chatId, {
      kind: 'read_receipt',
      chatId,
      messageId,
      messageIds: [messageId],
      timestamp: Date.now(),
    });
  }, [sendMessageToChat]);

  const joinChat = useCallback((chatId: string) => Boolean(chatId), []);
  const leaveChat = useCallback((chatId: string) => Boolean(chatId), []);

  const disconnect = useCallback(() => {
    const manager = managerRef.current;
    hasRelayAuthRef.current = false;
    setIsConnected(false);
    setReadyState(WebSocket.CLOSED);
    manager?.disconnect();
  }, []);

  return {
    isConnected,
    readyState,
    sendMessage,
    send,
    on,
    joinChat,
    leaveChat,
    sendTyping,
    sendMessageToChat,
    sendReadReceipt,
    disconnect,
  };
}

export default useWebSocket;
