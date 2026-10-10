import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadChronicleList,
  type ChronicleListItemView,
} from '../adapters/chronicleAdapter.js';

export type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; view: T };

export function useChroniclesPage(): PageData<ChronicleListItemView[]> {
  const q = useQuery({
    queryKey: queryKeys.chronicleList,
    queryFn: loadChronicleList,
  });
  if (q.isError) {
    return { status: 'error', error: toAppError(q.error, 'chronicle:list-page') };
  }
  if (q.isLoading || q.data === undefined) return { status: 'loading' };
  if (q.data.length === 0) return { status: 'empty' };
  return { status: 'ready', view: q.data };
}
