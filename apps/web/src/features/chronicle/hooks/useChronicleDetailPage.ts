import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadChronicleDetail,
  type ChronicleDetailView,
} from '../adapters/chronicleAdapter.js';

type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; view: T };

export function useChronicleDetailPage(slug: string): PageData<ChronicleDetailView> {
  const q = useQuery({
    queryKey: queryKeys.chronicleDetail(slug),
    queryFn: () => loadChronicleDetail(slug),
    enabled: Boolean(slug),
  });
  if (!slug)
    return {
      status: 'error',
      error: toAppError({ failure: 'NotFound' }, 'chronicle:detail-page'),
    };
  if (q.isError) {
    return { status: 'error', error: toAppError(q.error, 'chronicle:detail-page') };
  }
  if (q.isLoading || !q.data) return { status: 'loading' };
  return { status: 'ready', view: q.data };
}
