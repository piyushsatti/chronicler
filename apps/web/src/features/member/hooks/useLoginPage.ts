import { useLocation } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext.js';
import { canAccessVerify, isAdmin } from '../../../auth/roles.js';
import { useMe } from '../../../hooks/useMe.js';
import { toAppError } from '../../../errors/toAppError.js';

export function useLoginPage() {
  const { login, loginError, logout, isAuthenticated } = useAuth();
  const location = useLocation();
  const me = useMe();
  const roles = me.data?.roles ?? [];
  // ProtectedRoute sends guests here with the page they asked for; sign-in returns them to it.
  const state = location.state as { from?: { pathname?: unknown } } | null;
  const redirected = typeof state?.from?.pathname === 'string';
  return {
    login,
    loginError,
    logout,
    isAuthenticated,
    redirected,
    account: me.isError
      ? ({ status: 'error', error: toAppError(me.error, 'login:account') } as const)
      : me.data
        ? ({
            status: 'ready',
            displayName: me.data.displayName ?? me.data.handle,
          } as const)
        : ({ status: 'loading' } as const),
    retryAccount: () => void me.refetch(),
    canAdmin: isAdmin(roles),
    canVerify: canAccessVerify(roles),
  };
}
