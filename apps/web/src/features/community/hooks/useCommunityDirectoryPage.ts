import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadCommunityMembers,
  type CommunityMemberView,
} from '../adapters/communityAdapter.js';

export type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; view: T };

export function useCommunityDirectoryPage(
  role: 'dm' | 'player',
): PageData<CommunityMemberView[]> {
  const q = useQuery({
    queryKey: queryKeys.communityMembers(role),
    queryFn: () => loadCommunityMembers(role),
  });
  if (q.isError) {
    return {
      status: 'error',
      error: toAppError(q.error, 'community:directory-page'),
    };
  }
  if (q.isLoading || q.data === undefined) return { status: 'loading' };
  if (q.data.length === 0) return { status: 'empty' };
  return { status: 'ready', view: q.data };
}
