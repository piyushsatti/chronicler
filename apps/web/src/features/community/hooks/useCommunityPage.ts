import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadCommunityHub,
  type CommunityHubView,
} from '../adapters/communityAdapter.js';

export type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; view: T };

export function useCommunityPage(): PageData<CommunityHubView> {
  const q = useQuery({
    queryKey: queryKeys.communityHub,
    queryFn: loadCommunityHub,
  });
  if (q.isError) {
    return { status: 'error', error: toAppError(q.error, 'community:hub-page') };
  }
  if (q.isLoading || !q.data) return { status: 'loading' };
  return { status: 'ready', view: q.data };
}
