import { useAuth } from '../../../auth/AuthContext.js';
import { canAccessVerify, isAdmin } from '../../../auth/roles.js';
import { useMe } from '../../../hooks/useMe.js';

export function useLoginPage() {
  const { login, loginError, logout, isAuthenticated } = useAuth();
  const me = useMe();
  const roles = me.data?.roles ?? [];
  return {
    login,
    loginError,
    logout,
    isAuthenticated,
    displayName: me.data?.displayName ?? me.data?.handle ?? 'member',
    canAdmin: isAdmin(roles),
    canVerify: canAccessVerify(roles),
  };
}
