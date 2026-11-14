import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadPersonalization, updateMySettings } from '../adapters/personalizationAdapter.js';
import { queryKeys } from '../api/queryKeys.js';
import { useAuth } from '../context/AuthContext.js';

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
  const { memberId, isCurrentMember } = useAuth();
  const personalization = usePersonalization();

  const settingsMutation = useMutation({
    // A new member key detaches the observer, so sign-out drops the old save state.
    mutationKey: ['updateMySettings', memberId],
    mutationFn: async (patch: Parameters<typeof updateMySettings>[0]) => ({
      data: await updateMySettings(patch, crypto.randomUUID()),
      account: memberId,
    }),
    onSuccess: (result) => {
      if (!isCurrentMember(result.account)) return;
      queryClient.setQueryData(
        [...queryKeys.personalization, result.account],
        result.data,
      );
    },
  });

  const retryLoading = (): void => {
    void personalization.refetch();
  };
  return { personalization, settingsMutation, retryLoading };
}
