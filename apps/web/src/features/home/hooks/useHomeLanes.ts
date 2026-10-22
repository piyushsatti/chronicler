import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { toAppError } from '../../../errors/toAppError.js';
import { loadHomeLanes } from '../adapters/homeLanesAdapter.js';

export function useHomeLanes() {
  const { sessionReady, token, isCurrentSession } = useAuth();
  return useQuery({
    queryKey: queryKeys.homeLanes,
    queryFn: async ({ signal }) => {
      if (!sessionReady || (token !== null && !isCurrentSession(token)))
        throw toAppError({ failure: 'Unauthorized' }, 'home:session');
      const lanes = await loadHomeLanes(signal);
      if (token !== null && !isCurrentSession(token))
        throw toAppError({ failure: 'Unauthorized' }, 'home:session');
      return lanes;
    },
    enabled: sessionReady,
  });
}
