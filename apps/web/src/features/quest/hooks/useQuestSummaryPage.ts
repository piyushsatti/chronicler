import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadQuestSummaryPage,
  type QuestSummaryPageView,
} from '../adapters/questSummaryAdapter.js';

export type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; view: T };

export function useQuestSummaryPage(
  shortCode: string,
): PageData<QuestSummaryPageView> {
  const q = useQuery({
    queryKey: queryKeys.questSummary(shortCode),
    queryFn: () => loadQuestSummaryPage(shortCode),
    enabled: Boolean(shortCode),
  });
  if (q.isError) {
    return { status: 'error', error: toAppError(q.error, 'quest:summary-page') };
  }
  if (q.isLoading || !q.data) return { status: 'loading' };
  return { status: 'ready', view: q.data };
}
