import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { useNotificationSession } from './useNotificationSession.js';
import { loadUnreadCount } from '../adapters/notificationsAdapter.js';

export function useUnreadCount(enabled: boolean) {
  const { session, requireCurrent } = useNotificationSession();
  return useQuery({
    queryKey: [...queryKeys.notificationsUnread, session?.authority ?? null],
    queryFn: async ({ signal }) => {
      const active = requireCurrent(session);
      const count = await loadUnreadCount({ token: active.token, signal });
      requireCurrent(active);
      return count;
    },
    enabled: enabled && session !== null,
    retry: false,
  });
}
