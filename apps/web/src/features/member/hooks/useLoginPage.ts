import { useLocation } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext.js';

export function useLoginPage() {
  const { login, loginError, isAuthenticated } = useAuth();
  const location = useLocation();
  // ProtectedRoute sends guests here with the page they asked for; sign-in returns them to it.
  const state = location.state as { from?: { pathname?: unknown } } | null;
  const redirected = typeof state?.from?.pathname === 'string';
  return { login, loginError, isAuthenticated, redirected };
}
