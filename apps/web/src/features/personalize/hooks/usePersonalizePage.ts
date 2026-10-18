import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import {
  loadPersonalization,
  updateMySettings,
} from '../adapters/personalizationAdapter.js';

export function usePersonalizePage() {
  const queryClient = useQueryClient();
  const personalization = useQuery({
    queryKey: queryKeys.personalization,
    queryFn: loadPersonalization,
  });

  const settingsMutation = useMutation({
    mutationFn: updateMySettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.personalization });
    },
  });

  return { personalization, settingsMutation };
}
