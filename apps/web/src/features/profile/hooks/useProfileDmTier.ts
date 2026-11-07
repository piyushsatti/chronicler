import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../auth/AuthContext.js';
import { loadProfileDmTier } from '../adapters/profileDmTier.js';

// myUnlocks describes the signed-in member only.
export function useProfileDmTier(enabled: boolean) {
  const { isAuthenticated, sessionReady } = useAuth();
  const query = useQuery({
    queryKey: ['profileDmTier'],
    enabled: enabled && sessionReady && isAuthenticated,
    retry: false,
    queryFn: loadProfileDmTier,
  });
  return enabled ? (query.data ?? '').trim() : '';
}
