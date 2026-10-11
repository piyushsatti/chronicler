import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { loadUnreadCount } from '../adapters/notificationsAdapter.js';

export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.notificationsUnread,
    queryFn: loadUnreadCount,
    enabled,
  });
}
