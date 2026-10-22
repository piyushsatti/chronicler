import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadQuest, type QuestDetailView } from '../adapters/questAdapter.js';

type PageData =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | { status: 'ready'; view: QuestDetailView };
export function useQuestPage(
  shortCode: string,
): PageData & { retry: () => void; fetching: boolean } {
  const query = useQuery({
    queryKey: queryKeys.quest(shortCode),
    queryFn: () => loadQuest({ shortCode }),
    enabled: shortCode !== '',
    refetchInterval: (state) =>
      state.state.data?.discordDelivery.isTerminal === false ? 5_000 : false,
  });
  const shared = {
    retry: () => {
      void query.refetch();
    },
    fetching: query.isFetching,
  };
  if (query.isError)
    return {
      status: 'error',
      error: toAppError(query.error, 'quest:detail'),
      ...shared,
    };
  if (!query.data) return { status: 'loading', ...shared };
  return { status: 'ready', view: query.data, ...shared };
}
