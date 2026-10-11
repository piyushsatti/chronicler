import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AUTH_DISCORD_PATH } from '../api/endpoints.js';
import { safeAppError, toAppError } from '../errors/toAppError.js';
import type { AppError } from '../errors/types.js';
import { TransportError } from '../errors/types.js';
import type { MemberViewModel } from '../features/member/adapters/memberAdapter.js';
import { EXPIRES_KEY, TOKEN_KEY } from './storage.js';
import { beginOAuthState, discardOAuthState } from './oauthState.js';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload: unknown = JSON.parse(json);
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function expiresAt(token: string): number | null {
  const payload = decodeJwtPayload(token);
  const exp = payload?.['exp'];
  return typeof exp === 'number' && Number.isFinite(exp * 1000) ? exp * 1000 : null;
}

function isTokenExpired(token: string): boolean {
  const expiry = expiresAt(token);
  return expiry === null || Date.now() >= expiry;
}

/** Adapters retain the typed transport cause when building an AppError. */
function isSessionRejection(error: unknown): boolean {
  if (error instanceof TransportError) {
    return error.status === 401 || error.code === 'UNAUTHORIZED';
  }
  return Boolean(
    error &&
    typeof error === 'object' &&
    'cause' in error &&
    error.cause instanceof TransportError &&
    isSessionRejection(error.cause),
  );
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
  if (!stored || isTokenExpired(stored)) {
    ls.removeItem(TOKEN_KEY);
    ls.removeItem(EXPIRES_KEY);
    return null;
  }
  return stored;
}

function isMeQuery(key: readonly unknown[]): boolean {
  return key.length === 1 && key[0] === 'me';
}

export type AuthState = {
  token: string | null;
  isAuthenticated: boolean;
  /** The provider clears pre-existing server caches before account validation. */
  sessionReady: boolean;
  /** Checks retained callbacks against the current session, including expiry. */
  isCurrentSession: (candidate: string | null) => boolean;
  /** Identity hint only — never use for roles. */
  discordId: string | null;
  login: () => void;
  loginError: AppError | null;
  logout: () => void;
  storeToken: (token: string) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const tokenRef = useRef(token);
  const [sessionReady, setSessionReady] = useState(false);
  const [loginError, setLoginError] = useState<AppError | null>(null);

  const clearCachedQueries = useCallback(
    (preserveMe = false): void => {
      const predicate = (query: { queryKey: readonly unknown[] }): boolean =>
        !preserveMe || !isMeQuery(query.queryKey);
      for (const query of queryClient.getQueryCache().findAll({ predicate })) {
        // Removal alone leaves mounted observers holding their last result.
        // Empty them first so useQuery reattaches normally without remounting forms.
        void query.cancel({ silent: true });
        query.setState({
          data: undefined,
          dataUpdatedAt: 0,
          error: null,
          errorUpdatedAt: 0,
          fetchFailureCount: 0,
          fetchFailureReason: null,
          fetchMeta: null,
          isInvalidated: true,
          status: 'pending',
          fetchStatus: 'idle',
        });
      }
      if (preserveMe) {
        queryClient.removeQueries({ predicate });
        queryClient.getMutationCache().clear();
      } else {
        queryClient.clear();
      }
    },
    [queryClient],
  );

  const logout = useCallback((): void => {
    const ls = storage();
    ls?.removeItem(TOKEN_KEY);
    ls?.removeItem(EXPIRES_KEY);
    tokenRef.current = null;
    clearCachedQueries();
    setToken(null);
  }, [clearCachedQueries]);

  const login = useCallback((): void => {
    const state = beginOAuthState();
    if (state === null) {
      discardOAuthState();
      setLoginError(
        safeAppError(
          'Sign-in could not start in this browser. Please try again.',
          'auth:login',
        ),
      );
      return;
    }
    try {
      logout();
      setLoginError(null);
      window.location.href = `${AUTH_DISCORD_PATH}?${new URLSearchParams({ state })}`;
    } catch {
      discardOAuthState();
      setLoginError(
        safeAppError(
          'Sign-in could not start in this browser. Please try again.',
          'auth:login',
        ),
      );
    }
  }, [logout]);

  const storeToken = useCallback(
    (newToken: string): void => {
      if (isTokenExpired(newToken)) {
        logout();
        throw toAppError({ failure: 'InvalidWire' }, 'auth:token');
      }
      const ls = storage();
      const payload = decodeJwtPayload(newToken);
      if (payload && typeof payload['exp'] === 'number') {
        ls?.setItem(EXPIRES_KEY, String(payload['exp']));
      }
      ls?.setItem(TOKEN_KEY, newToken);
      tokenRef.current = newToken;
      clearCachedQueries();
      setToken(newToken);
    },
    [clearCachedQueries, logout],
  );

  const isCurrentSession = useCallback((candidate: string | null): boolean => {
    return (
      candidate !== null && tokenRef.current === candidate && !isTokenExpired(candidate)
    );
  }, []);

  useEffect(() => {
    // One cache observer owns session rejection and validated-account changes.
    // Initialization also removes caches from an earlier provider/session.
    clearCachedQueries();
    setSessionReady(true);
    let authority: string | null = null;
    const queries = queryClient.getQueryCache();
    const unsubscribeQueries = queries.subscribe((event) => {
      if (event.type === 'removed' && isMeQuery(event.query.queryKey)) authority = null;
      if (
        event.type !== 'updated' ||
        queries.get(event.query.queryHash) !== event.query
      )
        return;
      if (
        event.action.type === 'error' &&
        tokenRef.current !== null &&
        isSessionRejection(event.query.state.error)
      ) {
        logout();
        return;
      }
      if (!isMeQuery(event.query.queryKey)) return;
      if (event.action.type === 'error') {
        authority = null;
        clearCachedQueries(true);
      } else if (event.action.type === 'success') {
        // The me query stores MemberViewModel only, after the member adapter validates wire.
        const member = event.query.state.data as MemberViewModel;
        const nextAuthority = JSON.stringify([
          member.id,
          [...new Set(member.roles)].sort(),
        ]);
        if (authority !== null && authority !== nextAuthority) clearCachedQueries(true);
        authority = nextAuthority;
      }
    });
    const mutations = queryClient.getMutationCache();
    const unsubscribeMutations = mutations.subscribe((event) => {
      if (
        event.type === 'updated' &&
        event.action.type === 'error' &&
        tokenRef.current !== null &&
        mutations.getAll().includes(event.mutation) &&
        isSessionRejection(event.mutation.state.error)
      )
        logout();
    });
    return () => {
      unsubscribeQueries();
      unsubscribeMutations();
    };
  }, [clearCachedQueries, logout, queryClient]);

  useEffect(() => {
    if (!token) return;
    let timeout: ReturnType<typeof setTimeout>;
    const checkExpiry = (): void => {
      const remaining = (expiresAt(token) ?? 0) - Date.now();
      if (remaining <= 0) {
        logout();
      } else {
        // Browser timers use signed 32-bit delays. Long-lived tokens need another check.
        timeout = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647));
      }
    };
    const checkOnFocus = (): void => {
      clearTimeout(timeout);
      checkExpiry();
    };
    const checkVisible = (): void => {
      if (document.visibilityState === 'visible') checkOnFocus();
    };
    checkExpiry();
    window.addEventListener('focus', checkOnFocus);
    document.addEventListener('visibilitychange', checkVisible);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('focus', checkOnFocus);
      document.removeEventListener('visibilitychange', checkVisible);
    };
  }, [logout, token]);

  useEffect(() => {
    const synchronize = (event: StorageEvent): void => {
      if (event.key !== TOKEN_KEY && event.key !== null) return;
      const stored = readStoredToken();
      if (stored === tokenRef.current) return;
      tokenRef.current = stored;
      clearCachedQueries();
      setToken(stored);
    };
    window.addEventListener('storage', synchronize);
    return () => window.removeEventListener('storage', synchronize);
  }, [clearCachedQueries]);

  const value = useMemo((): AuthState => {
    const isAuthenticated = token !== null && !isTokenExpired(token);
    let discordId: string | null = null;
    if (token) {
      const payload = decodeJwtPayload(token);
      if (payload && typeof payload['sub'] === 'string') {
        discordId = payload['sub'];
      }
    }
    return {
      token,
      isAuthenticated,
      sessionReady,
      isCurrentSession,
      discordId,
      login,
      loginError,
      logout,
      storeToken,
    };
  }, [isCurrentSession, login, loginError, logout, sessionReady, storeToken, token]);

  // No query observer mounts until the initial cache boundary has completed.
  return createElement(AuthContext.Provider, { value }, sessionReady ? children : null);
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
