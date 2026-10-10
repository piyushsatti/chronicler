import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadRulesHub, type RulesHubView } from '../adapters/rulesAdapter.js';

export type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; view: T };

export function useRulesPage(): PageData<RulesHubView> {
  const q = useQuery({
    queryKey: queryKeys.rulesHub,
    queryFn: loadRulesHub,
  });
  if (q.isError) {
    return { status: 'error', error: toAppError(q.error, 'rules:hub-page') };
  }
  if (q.isLoading || !q.data) return { status: 'loading' };
  if (q.data.guides.length === 0 && q.data.rulings.length === 0) {
    return { status: 'empty' };
  }
  return { status: 'ready', view: q.data };
}
