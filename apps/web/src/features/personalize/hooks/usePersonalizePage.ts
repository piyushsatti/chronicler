import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
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
  const attemptToken = useRef<string | null>(null);

  const settingsMutation = useMutation({
    mutationFn: async (patch: Parameters<typeof updateMySettings>[0]) => ({
      data: await updateMySettings(patch, crypto.randomUUID()),
      sessionToken: token,
      account: memberId,
    }),
    onMutate: () => {
      attemptToken.current = token;
    },
    onSuccess: (result) => {
      if (!isCurrentSession(result.sessionToken)) return;
      queryClient.setQueryData(
        [...queryKeys.personalization, result.account],
        result.data,
      );
    },
  });

  const live = isCurrentSession(attemptToken.current);

  const retryLoading = (): void => {
    void personalization.refetch();
  };
  return {
    personalization,
    settingsMutation: {
      ...settingsMutation,
      isPending: live && settingsMutation.isPending,
      isSuccess: live && settingsMutation.isSuccess,
      isError: live && settingsMutation.isError,
      error: live ? settingsMutation.error : null,
      data: live ? settingsMutation.data : undefined,
      reset: () => {
        attemptToken.current = null;
        settingsMutation.reset();
      },
    },
    retryLoading,
  };
}
