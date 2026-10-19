import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadChronicleList,
  type ChronicleListView,
} from '../adapters/chronicleAdapter.js';

export type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError; refetch: () => void }
  | { status: 'empty' }
  | { status: 'ready'; view: T; refetch: () => void };

export function useChroniclesPage(): PageData<ChronicleListView> {
  const q = useQuery({
    queryKey: queryKeys.chronicleList,
    queryFn: loadChronicleList,
  });
  const refetch = () => {
    void q.refetch();
  };
  if (q.isError) {
    return {
      status: 'error',
      error: toAppError(q.error, 'chronicle:list-page'),
      refetch,
    };
  }
  if (q.isLoading || q.data === undefined) return { status: 'loading' };
  if (q.data.items.length === 0) return { status: 'empty' };
  return { status: 'ready', view: q.data, refetch };
}
