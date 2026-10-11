/**
 * Auth context surface for Wave 1 shell ownership (`context/**`).
 * Implementation lives in `auth/` (T410 owns deeper OAuth plumbing).
 */
export {
  AuthProvider,
  useAuth,
  type AuthState,
} from '../auth/AuthContext.js';
