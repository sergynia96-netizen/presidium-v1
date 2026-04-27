/**
 * @author Сергей Сергеевич Карнаух
 * @copyright (C) 2026 Сергей Сергеевич Карнаух. All Rights Reserved.
 */
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>(() => {
    const token = localStorage.getItem("presidium_token");
    const userJson = localStorage.getItem("presidium_user");
    let user: User | null = null;
    try { user = userJson ? JSON.parse(userJson) : null; } catch {}
    return { user, token, isLoading: false, error: null };
  });

  const login = useCallback(async (email: string, password: string) => {
    setAuth(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const result = await invoke<{ token: string; user: User }>("login", { email, password });
      localStorage.setItem("presidium_token", result.token);
      localStorage.setItem("presidium_user", JSON.stringify(result.user));
      setAuth({ user: result.user, token: result.token, isLoading: false, error: null });
    } catch (e: any) {
      setAuth(prev => ({ ...prev, isLoading: false, error: String(e) }));
      throw e;
    }
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    setAuth(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const result = await invoke<{ token: string; user: User }>("register", { email, password, displayName });
      localStorage.setItem("presidium_token", result.token);
      localStorage.setItem("presidium_user", JSON.stringify(result.user));
      setAuth({ user: result.user, token: result.token, isLoading: false, error: null });
    } catch (e: any) {
      setAuth(prev => ({ ...prev, isLoading: false, error: String(e) }));
      throw e;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("presidium_token");
    localStorage.removeItem("presidium_user");
    setAuth({ user: null, token: null, isLoading: false, error: null });
  }, []);

  return { ...auth, login, register, logout };
}
