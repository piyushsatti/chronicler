import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { useMe } from '../../../hooks/useMe.js';
import { isAdmin } from '../../../auth/roles.js';
import { toAppError } from '../../../errors/toAppError.js';
import { loadQuestSummaryPage } from '../adapters/questSummaryAdapter.js';

export function useQuestSummaryPage(shortCode: string) {
  const me = useMe();
  const query = useQuery({
    queryKey: queryKeys.questSummary(shortCode),
    queryFn: () => loadQuestSummaryPage(shortCode),
    enabled: shortCode !== '',
  });
  const shared = {
    memberId: me.data?.id ?? null,
    canWriteDM: Boolean(
      me.data &&
      query.data &&
      (me.data.id === query.data.quest.dmId || isAdmin(me.data.roles)),
    ),
    retry: () => {
      void query.refetch();
    },
    fetching: query.isFetching,
  };
  if (query.isError)
    return {
      status: 'error' as const,
      error: toAppError(query.error, 'quest:summary'),
      ...shared,
    };
  if (!query.data) return { status: 'loading' as const, ...shared };
  return { status: 'ready' as const, view: query.data, ...shared };
}
