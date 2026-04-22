/**
 * @author Presidium Maintainer
 * @copyright (C) 2026 Presidium Maintainer. All Rights Reserved.
 */

import { useCallback, useRef, useState } from 'react';
import { create } from 'zustand';

export const UI_VERSION = '2.6.0';

export interface ThemeConfig {
  mode: 'dark' | 'light' | 'system';
  primaryColor: string;
  borderRadius: 'sm' | 'md' | 'lg' | 'full';
}

type AuthUser = {
  id: string;
  name?: string;
  email?: string;
  strikes?: number;
  createdAt?: string;
  [key: string]: unknown;
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  init: () => void;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
};

const STORAGE_TOKEN_KEY = 'presidium_token';
const STORAGE_USER_KEY = 'presidium_user';

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  init: () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem(STORAGE_TOKEN_KEY);
    const userRaw = localStorage.getItem(STORAGE_USER_KEY);
    const user = userRaw ? (JSON.parse(userRaw) as AuthUser) : null;
    set({
      token,
      user,
      isAuthenticated: Boolean(token),
    });
  },
  setAuth: (token, user) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
      localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
    }
    set({
      token,
      user,
      isAuthenticated: true,
    });
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      localStorage.removeItem(STORAGE_USER_KEY);
    }
    set({
      token: null,
      user: null,
      isAuthenticated: false,
    });
  },
}));

type WsStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

type WsMessage = {
  type: string;
  payload?: unknown;
};

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const [status, setStatus] = useState<WsStatus>('idle');

  const connect = useCallback(() => {
    const token = useAuthStore.getState().token;
    if (!token) {
      setStatus('error');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      setStatus('connected');
      return;
    }

    setStatus('connecting');
    const baseUrl =
      (typeof window !== 'undefined' && (window as { __PRESIDIUM_WS_URL?: string }).__PRESIDIUM_WS_URL) ||
      'ws://localhost:3001';
    const ws = new WebSocket(`${baseUrl}/?token=${encodeURIComponent(token)}`);

    ws.onopen = () => setStatus('connected');
    ws.onclose = () => {
      setStatus('disconnected');
      if (reconnectRef.current) {
        window.clearTimeout(reconnectRef.current);
      }
      reconnectRef.current = window.setTimeout(() => connect(), 3000);
    };
    ws.onerror = () => setStatus('error');
    wsRef.current = ws;
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectRef.current) {
      window.clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('disconnected');
  }, []);

  const send = useCallback((message: WsMessage) => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return false;
    wsRef.current.send(JSON.stringify(message));
    return true;
  }, []);

  return {
    status,
    connect,
    disconnect,
    send,
  };
}
