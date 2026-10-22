import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AdminReadRequest } from '../adapters/adminRequest.js';
import type { AdminPage, AdminPageRequest } from '../adapters/adminPage.js';
import {
  panelState,
  useAuthorityFailures,
  type useAdminAuthority,
} from './useAdminAuthority.js';

export type AdminPaginationState = {
  offset: number;
  pageSize: number;
  total: number | null;
  hasNext: boolean;
  busy: boolean;
  previous: () => void;
  next: () => void;
};

export function useAdminPage<T>(
  key: readonly unknown[],
  authority: ReturnType<typeof useAdminAuthority>,
  filters: object,
  load: (page: AdminPageRequest, request: AdminReadRequest) => Promise<AdminPage<T>>,
) {
  const scope = JSON.stringify([authority.cacheKey, filters]);
  // Reset to the first page when the account or filters change; adjusting state
  // during render avoids one query at the previous scope's offset.
  const [paging, setPaging] = useState({ scope, offset: 0 });
  if (paging.scope !== scope) setPaging({ scope, offset: 0 });
  const offset = paging.scope === scope ? paging.offset : 0;
  const moveBy = (delta: number) =>
    setPaging((current) => ({
      scope,
      offset: Math.max(0, (current.scope === scope ? current.offset : 0) + delta),
    }));
  const query = useQuery({
    enabled: authority.allowed,
    queryKey: [...key, authority.cacheKey, filters, offset],
    queryFn: ({ signal }) =>
      authority.read((request) => load({ offset, limit: 50 }, request), signal),
  });
  const page = query.data;
  const hasNext = page
    ? page.total === null
      ? page.hasNext
      : offset + page.items.length < page.total
    : false;
  const pagination: AdminPaginationState = {
    offset,
    pageSize: 50,
    total: page?.total ?? null,
    hasNext,
    busy: query.isFetching,
    previous: () => moveBy(-50),
    next: () => {
      if (hasNext) moveBy(50);
    },
  };
  useAuthorityFailures(query.error);
  return {
    query: panelState(
      {
        ...query,
        data: page?.items,
        retry: () => {
          void query.refetch();
        },
      },
      'admin:page',
    ),
    pagination,
  };
}
