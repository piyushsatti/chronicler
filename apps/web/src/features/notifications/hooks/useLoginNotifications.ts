import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import {
  acknowledgeSuppressedNotifications,
  loadNotifications,
} from '../adapters/notificationsAdapter.js';
import { useUnreadCount } from './useUnreadCount.js';

export function useLoginNotifications(enabled: boolean) {
  const client = useQueryClient();
  const unreadQ = useUnreadCount(enabled);
  const listQ = useQuery({
    queryKey: queryKeys.notificationsPreview(20),
    queryFn: () => loadNotifications({ limit: 20 }),
    enabled,
  });
  const ack = useMutation({
    mutationFn: acknowledgeSuppressedNotifications,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: queryKeys.notifications });
      await client.invalidateQueries({
        queryKey: queryKeys.notificationsUnread,
      });
    },
  });

  return { unreadQ, listQ, ack };
}
