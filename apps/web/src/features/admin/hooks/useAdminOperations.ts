import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { loadAdminOperations } from '../adapters/adminAdapter.js';
import {
  panelState,
  useAdminAuthority,
  useAuthorityFailures,
} from './useAdminAuthority.js';
import type { AdminPaginationState } from './useAdminPage.js';

export function useAdminOperations() {
  const authority = useAdminAuthority();
  const [deliveryOffset, setDeliveryOffset] = useState(0);
  const [alertOffset, setAlertOffset] = useState(0);
  const query = useQuery({
    enabled: authority.allowed,
    queryKey: ['adminOperations', authority.cacheKey, deliveryOffset, alertOffset],
    queryFn: ({ signal }) =>
      authority.read(
        (request) =>
          loadAdminOperations(
            {
              limit: 25,
              offset: deliveryOffset,
              alertsLimit: 25,
              alertsOffset: alertOffset,
            },
            request,
          ),
        signal,
      ),
  });
  useAuthorityFailures(query.error);
  function page(
    offset: number,
    total: number | undefined,
    setOffset: (next: number) => void,
  ): AdminPaginationState {
    const hasNext = total !== undefined && offset + 25 < total;
    return {
      offset,
      pageSize: 25,
      total: total ?? null,
      hasNext,
      busy: query.isFetching,
      previous: () => setOffset(Math.max(0, offset - 25)),
      next: () => {
        if (hasNext) setOffset(offset + 25);
      },
    };
  }
  const retry = () => {
    void query.refetch();
  };
  return {
    retry,
    query: panelState(query, 'admin:operations'),
    deliveryPage: page(deliveryOffset, query.data?.deliveryTotal, setDeliveryOffset),
    alertPage: page(alertOffset, query.data?.activeAlertCount, setAlertOffset),
  };
}

export type AdminOperationsView = ReturnType<typeof useAdminOperations>;
