import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { canCreateRecord } from '../../../auth/createRules.js';
import { useLiveDm } from '../../../hooks/useLiveDm.js';
import { useMe } from '../../../hooks/useMe.js';
import { loadDmDashboard } from '../adapters/dmDashboardAdapter.js';
import {
  panelState,
  useAdminAuthority,
  useAuthorityFailures,
} from './useAdminAuthority.js';
import type { AdminPaginationState } from './useAdminPage.js';

export function useDmDashboard() {
  const authority = useAdminAuthority('dm');
  const me = useMe();
  const liveDm = useLiveDm();
  const [questOffset, setQuestOffset] = useState(0),
    [tableOffset, setTableOffset] = useState(0);
  const query = useQuery({
    enabled: authority.allowed && me.isSuccess,
    queryKey: ['dmDashboard', authority.cacheKey, questOffset, tableOffset],
    queryFn: ({ signal }) =>
      authority.read(
        (request) => loadDmDashboard(me.data!.id, questOffset, tableOffset, request),
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
    retry: () => {
      void query.refetch();
    },
    questPage: page(questOffset, query.data?.quests.total, setQuestOffset),
    tablePage: page(tableOffset, query.data?.documents.total, setTableOffset),
  };
}
