import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadQuest, type QuestDetailView } from '../adapters/questAdapter.js';

export type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'empty' }
  | { status: 'ready'; view: T };

export function useQuestPage(shortCode: string): PageData<QuestDetailView> {
  const invalidated403 = useRef(false);
  const q = useQuery({
    queryKey: queryKeys.quest(shortCode),
    queryFn: () => loadQuest({ shortCode }),
    enabled: Boolean(shortCode),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return false;
      return data.discordDelivery.isTerminal ? false : 5_000;
    },
  });

  if (q.isError) {
    const error = toAppError(q.error, 'quest:detail-page');
    if (error.kind === 'forbidden' && !invalidated403.current) {
      invalidated403.current = true;
      void q.refetch();
    }
    return { status: 'error', error };
  }
  if (q.isLoading || !q.data) return { status: 'loading' };
  return { status: 'ready', view: q.data };
}
