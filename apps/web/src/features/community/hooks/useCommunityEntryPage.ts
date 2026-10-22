import { useQuery } from '@tanstack/react-query';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadCommunityEntry } from '../adapters/communityEntryAdapter.js';

type CommunityEntryPageState =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; view: Awaited<ReturnType<typeof loadCommunityEntry>> };

export function useCommunityEntryPage(slug: string): CommunityEntryPageState {
  const query = useQuery({
    queryKey: ['communityEntry', slug],
    queryFn: () => loadCommunityEntry(slug),
    enabled: Boolean(slug),
  });
  if (!slug || query.isError) {
    return {
      status: 'error',
      error: toAppError(query.error ?? { failure: 'NotFound' }, 'community:entry'),
    };
  }
  if (query.isLoading || !query.data) return { status: 'loading' };
  return { status: 'ready', view: query.data };
}
