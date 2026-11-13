import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { canCreateRecord } from '../auth/createRules.js';
import { useLiveDm } from './useLiveDm.js';
import { useMe } from './useMe.js';
import { loadDmDashboard } from '../features/admin/adapters/dmDashboardAdapter.js';
import {
  panelState,
  useAdminAuthority,
  useAuthorityFailures,
} from '../features/admin/hooks/useAdminAuthority.js';
import type { AdminPaginationState } from '../features/admin/hooks/useAdminPage.js';

export function useDmDashboard(questScope: 'page' | 'all' = 'page') {
  const authority = useAdminAuthority('dm');
  const me = useMe();
  const liveDm = useLiveDm();
  const [questOffset, setQuestOffset] = useState(0);
  const query = useQuery({
    enabled: authority.allowed && me.isSuccess,
    queryKey: ['dmDashboard', authority.cacheKey, questOffset, questScope],
    queryFn: ({ signal }) =>
      authority.read(
        (request) => loadDmDashboard(me.data!.id, questOffset, request, questScope),
        signal,
      ),
  });
  useAuthorityFailures(query.error);
  function page(
    offset: number,
    total: number | undefined,
    set: (value: number) => void,
  ): AdminPaginationState {
    const hasNext = total !== undefined && offset + 25 < total;
    return {
      offset,
      total: total ?? null,
      pageSize: 25,
      hasNext,
      busy: query.isFetching,
      previous: () => set(Math.max(0, offset - 25)),
      next: () => {
        if (hasNext) set(offset + 25);
      },
    };
  }
  return {
    query: panelState(query, 'dm:dashboard'),
    // The DM role opens this dashboard; posting a quest also needs an approved DM profile.
    canCreateQuest:
      me.isSuccess &&
      canCreateRecord('quest', {
        roles: me.data.roles,
        liveDm: liveDm.status === 'ready' && liveDm.liveDm,
      }),
    /** The DM profile editor; `/me` only until the account handle is known. */
    profileHref: me.isSuccess
      ? `/dms/@${encodeURIComponent(me.data.handle)}?edit=profile`
      : '/me',
    retry: () => {
      void query.refetch();
    },
    questPage: page(questOffset, query.data?.quests.total, setQuestOffset),
  };
}
