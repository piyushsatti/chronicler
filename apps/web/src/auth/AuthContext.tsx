import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AUTH_DISCORD_PATH } from '../api/endpoints.js';
import { EXPIRES_KEY, TOKEN_KEY } from './storage.js';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload['exp'] !== 'number') return true;
  return Date.now() / 1000 > payload['exp'];
}

function storage(): Storage | null {
  try {
    return typeof globalThis.localStorage !== 'undefined'
      ? globalThis.localStorage
      : null;
  } catch {
    return null;
  }
}

function readStoredToken(): string | null {
  const ls = storage();
  if (!ls) return null;
  const stored = ls.getItem(TOKEN_KEY);
  if (!stored) return null;
  if (isTokenExpired(stored)) {
    ls.removeItem(TOKEN_KEY);
    ls.removeItem(EXPIRES_KEY);
    return null;
  }
  return stored;
}

export type AuthState = {
  token: string | null;
  isAuthenticated: boolean;
  /** Identity hint only — never use for roles. */
  discordId: string | null;
  login: () => void;
  logout: () => void;
  storeToken: (token: string) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => readStoredToken());

  useEffect(() => {
    const ls = storage();
    if (token && isTokenExpired(token)) {
      ls?.removeItem(TOKEN_KEY);
      ls?.removeItem(EXPIRES_KEY);
      queryClient.clear();
      setToken(null);
    }
  }, [queryClient, token]);

  const login = useCallback((): void => {
    window.location.href = AUTH_DISCORD_PATH;
  }, []);

  const logout = useCallback((): void => {
    const ls = storage();
    ls?.removeItem(TOKEN_KEY);
    ls?.removeItem(EXPIRES_KEY);
    queryClient.clear();
    setToken(null);
  }, [queryClient]);

  const storeToken = useCallback(
    (newToken: string): void => {
      const ls = storage();
      const payload = decodeJwtPayload(newToken);
      if (payload && typeof payload['exp'] === 'number') {
        ls?.setItem(EXPIRES_KEY, String(payload['exp']));
      }
      ls?.setItem(TOKEN_KEY, newToken);
      queryClient.clear();
      setToken(newToken);
    },
    [queryClient],
  );

  const value = useMemo((): AuthState => {
    const isAuthenticated = token !== null && !isTokenExpired(token);
    let discordId: string | null = null;
    if (token) {
      const payload = decodeJwtPayload(token);
      if (payload && typeof payload['sub'] === 'string') {
        discordId = payload['sub'];
      }
    }
    return { token, isAuthenticated, discordId, login, logout, storeToken };
  }, [login, logout, storeToken, token]);

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
