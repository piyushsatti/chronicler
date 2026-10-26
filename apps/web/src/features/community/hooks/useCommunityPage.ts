import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadCommunityHub,
  loadCommunityCharacters,
  loadCommunityRegionNames,
  type CommunityHubView,
} from '../adapters/communityAdapter.js';
import { loadHallOfFame } from '../adapters/communityHallOfFameAdapter.js';

type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError; retry: () => void }
  | { status: 'ready'; view: T };

export function useCommunityPage(): PageData<CommunityHubView> {
  const q = useQuery({
    queryKey: queryKeys.communityHub,
    queryFn: ({ signal }) => loadCommunityHub(signal),
  });
  if (q.isError) {
    return {
      status: 'error',
      error: toAppError(q.error, 'community:hub-page'),
      retry: () => {
        void q.refetch();
      },
    };
  }
  if (q.isLoading || !q.data) return { status: 'loading' };
  return { status: 'ready', view: q.data };
}

export function useCommunityCharacters() {
  const [limit, setLimit] = useState(100);
  const regions = useQuery({
    queryKey: ['communityRegions'],
    queryFn: loadCommunityRegionNames,
    staleTime: 5 * 60 * 1000,
  });
  const query = useQuery({
    queryKey: ['communityCharacters', limit],
    queryFn: () => loadCommunityCharacters(limit),
  });
  const hasMore = query.data !== undefined && query.data.items.length < query.data.total;
  return {
    ...query,
    error: query.isError ? toAppError(query.error, 'community:characters') : null,
    regionNames: regions.data ?? {},
    regionNamesStatus: regions.isError ? 'error' as const : regions.isPending ? 'loading' as const : 'ready' as const,
    hasMore,
    loadMore: () => {
      if (hasMore && !query.isFetching) setLimit((current) => current + 100);
    },
  };
}

/** The Hall of Fame page: one shared Document that everyone reads and admins edit. */
export function useHallOfFame() {
  const query = useQuery({
    queryKey: ['communityHallOfFame'],
    queryFn: loadHallOfFame,
  });
  return {
    status: query.isError
      ? ('error' as const)
      : query.isPending
        ? ('loading' as const)
        : query.data
          ? ('ready' as const)
          : ('missing' as const),
    page: query.data ?? null,
    error: query.isError ? toAppError(query.error, 'community:hall-of-fame') : null,
    retry: () => {
      void query.refetch();
    },
  };
}
