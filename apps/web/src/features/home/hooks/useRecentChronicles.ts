import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { toAppError } from '../../../errors/toAppError.js';
import { loadRecentChronicles, type RecentChronicleView } from '../adapters/homeAdapter.js';

export type RecentChroniclesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: RecentChronicleView[] };

/** Newest published chronicle entries for the Home lane (DM-only entries excluded). */
export function useRecentChronicles(limit: number): RecentChroniclesState {
  const { sessionReady, token, isCurrentSession } = useAuth();
  const query = useQuery({
    queryKey: queryKeys.homeRecentChronicles(token !== null),
    queryFn: async ({ signal }) => {
      if (!sessionReady || (token !== null && !isCurrentSession(token)))
        throw toAppError({ failure: 'Unauthorized' }, 'home:session');
      const items = await loadRecentChronicles(signal);
      if (token !== null && !isCurrentSession(token))
        throw toAppError({ failure: 'Unauthorized' }, 'home:session');
      return items;
    },
    enabled: sessionReady,
  });
  if (query.isError) return { status: 'error' };
  if (query.data === undefined) return { status: 'loading' };
  return { status: 'ready', items: query.data.slice(0, limit) };
}
