import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys.js';
import { useAuth } from '../auth/AuthContext.js';
import { toAppError } from '../errors/toAppError.js';
import type { AppError } from '../errors/types.js';
import {
  loadMe,
  type MemberViewModel,
} from '../features/member/adapters/memberAdapter.js';

export function useMe(): UseQueryResult<MemberViewModel, AppError> {
  const { isAuthenticated, isCurrentSession, sessionReady, token } = useAuth();
  const query = useQuery<MemberViewModel, AppError>({
    queryKey: queryKeys.me,
    queryFn: async () => {
      // Refetch bypasses enabled, so a retained callback must also check the live session.
      if (!sessionReady || !isCurrentSession(token)) {
        throw toAppError({ failure: 'Unauthorized' }, 'me:session');
      }
      const member = await loadMe();
      if (!isCurrentSession(token)) {
        throw toAppError({ failure: 'Unauthorized' }, 'me:session');
      }
      return member;
    },
    enabled: isAuthenticated && sessionReady,
    retry: false,
    retryOnMount: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  if (!isAuthenticated || !sessionReady) {
    return {
      ...query,
      data: undefined,
      error: null,
      status: 'pending',
      fetchStatus: 'idle',
      isPending: true,
      isSuccess: false,
      isError: false,
      isLoading: false,
      isInitialLoading: false,
      isLoadingError: false,
      isRefetchError: false,
      isPlaceholderData: false,
      isFetching: false,
      isRefetching: false,
    };
  }
  if (query.isError) {
    // A failed refetch can retain successful data in TanStack Query. It grants no authority.
    return { ...query, data: undefined, isLoadingError: true, isRefetchError: false };
  }
  return query;
}
