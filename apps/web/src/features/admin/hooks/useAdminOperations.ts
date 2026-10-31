import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import {
  loadAdminOperations,
  redriveDiscordDelivery,
} from '../adapters/adminAdapter.js';
import {
  panelState,
  useAdminAuthority,
  useAuthorityFailures,
} from './useAdminAuthority.js';
import type { AdminPaginationState } from './useAdminPage.js';

export function useAdminOperations() {
  const authority = useAdminAuthority();
  const queryClient = useQueryClient();
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
  const [redriveFeedback, setRedriveFeedback] = useState<{
    message: string;
    isError: boolean;
  } | null>(null);
  const redrive = useMutation<unknown, unknown, string>({
    mutationKey: ['adminCommand', authority.commandKey, 'redriveDiscordDelivery'],
    networkMode: 'always',
    retry: false,
    mutationFn: authority.guardMutation((command, jobId: string) =>
      redriveDiscordDelivery({ jobId }, command),
    ),
    onSuccess: async () => {
      if (!authority.isCurrent()) return;
      setRedriveFeedback({ message: 'Delivery queued to try again.', isError: false });
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminOperations });
    },
    onError: (error) => {
      if (!authority.isCurrent()) return;
      setRedriveFeedback({
        message: toAppError(error, 'admin:delivery:redrive').userMessage,
        isError: true,
      });
    },
  });
  useAuthorityFailures(query.error, redrive.error);
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
    redrive: panelState(redrive, 'admin:delivery:redrive'),
    redriveFeedback,
  };
}

export type AdminOperationsView = ReturnType<typeof useAdminOperations>;
