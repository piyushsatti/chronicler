import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadRuleDetail, type RuleDetailView } from '../adapters/rulesAdapter.js';

export type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; view: T };

export function useRuleDetailPage(slug: string): PageData<RuleDetailView> {
  const q = useQuery({
    queryKey: queryKeys.ruleDetail(slug),
    queryFn: () => loadRuleDetail(slug),
    enabled: Boolean(slug),
  });
  if (q.isError) {
    return { status: 'error', error: toAppError(q.error, 'rules:detail-page') };
  }
  if (q.isLoading || !q.data) return { status: 'loading' };
  return { status: 'ready', view: q.data };
}
