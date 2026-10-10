import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys.js';
import { useAuth } from '../auth/AuthContext.js';
import { loadMe } from '../features/member/adapters/memberAdapter.js';

export function useMe() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: loadMe,
    enabled: isAuthenticated,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
