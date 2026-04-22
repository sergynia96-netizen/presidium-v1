/**
 * @author Карнаух Сергей Сергеевич
 * @copyright (C) 2026 Карнаух Сергей Сергеевич
 */
import { useEffect, useState } from 'react';

export interface AuthUser {
  id?: string;
  name?: string;
  email?: string;
  secretKey?: string;
  [key: string]: unknown;
}

interface AuthSnapshot {
  token: string | null;
  user: AuthUser | null;
}

export function useAuth(): AuthSnapshot {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(() => readSnapshot());

  useEffect(() => {
    const onStorage = () => {
      setSnapshot(readSnapshot());
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return snapshot;
}

export function useAuthStore(): AuthSnapshot & { logout: () => void } {
  const snapshot = useAuth();

  const logout = () => {
    if (typeof window === 'undefined') {
      return;
    }

    localStorage.removeItem('presidium_token');
    localStorage.removeItem('presidium_user');
    localStorage.removeItem('presidium-secret-key');
    localStorage.removeItem('presidium-auth');

    window.dispatchEvent(new Event('storage'));
    window.location.href = '/';
  };

  return {
    ...snapshot,
    logout,
  };
}

function readSnapshot(): AuthSnapshot {
  if (typeof window === 'undefined') {
    return { token: null, user: null };
  }

  const zustandRaw = localStorage.getItem('presidium-auth');
  if (zustandRaw) {
    try {
      const parsed = JSON.parse(zustandRaw) as {
        state?: { accessToken?: string | null; user?: AuthUser | null };
      };
      return {
        token: parsed.state?.accessToken ?? null,
        user: withSecretKey(parsed.state?.user ?? null),
      };
    } catch {
      // fallback below
    }
  }

  const token = localStorage.getItem('presidium_token');
  const userRaw = localStorage.getItem('presidium_user');

  return {
    token,
    user: withSecretKey(userRaw ? (JSON.parse(userRaw) as AuthUser) : null),
  };
}

function withSecretKey(user: AuthUser | null): AuthUser | null {
  if (!user) {
    return null;
  }

  if (user.secretKey) {
    return user;
  }

  const secretKey = localStorage.getItem('presidium-secret-key') || undefined;
  return {
    ...user,
    secretKey,
  };
}
