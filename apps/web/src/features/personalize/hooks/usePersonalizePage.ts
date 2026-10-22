import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect } from 'react';
import { queryKeys } from '../../../api/queryKeys.js';
import { useAuth } from '../../../context/AuthContext.js';
import {
  loadPersonalization,
  updateMySettings,
} from '../adapters/personalizationAdapter.js';

export function usePersonalization() {
  const { isAuthenticated, memberId, sessionReady } = useAuth();
  return useQuery({
    queryKey: [...queryKeys.personalization, memberId],
    queryFn: loadPersonalization,
    enabled: isAuthenticated && sessionReady,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function usePersonalizePage() {
  const queryClient = useQueryClient();
  const { token, memberId, isCurrentSession } = useAuth();
  const personalization = usePersonalization();

  const settingsMutation = useMutation({
    mutationFn: async (patch: Parameters<typeof updateMySettings>[0]) => ({
      data: await updateMySettings(patch),
      sessionToken: token,
      account: memberId,
    }),
    onSuccess: (result) => {
      if (!isCurrentSession(result.sessionToken)) return;
      queryClient.setQueryData(
        [...queryKeys.personalization, result.account],
        result.data,
      );
    },
  });
  const { reset } = settingsMutation;
  useLayoutEffect(() => {
    reset();
  }, [token, reset]);

  const retryLoading = (): void => {
    void personalization.refetch();
  };
  return { personalization, settingsMutation, retryLoading };
}
