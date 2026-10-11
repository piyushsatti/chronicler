import { useCallback, useEffect } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadNotifications } from '../adapters/notificationsAdapter.js';
import type { NotificationView } from '../types.js';
import { useMarkNotificationsRead } from './useMarkNotificationsRead.js';

const PAGE_SIZE = 20;

export type NotificationsPageView =
  | { status: 'loading' }
  | { status: 'error'; error: AppError }
  | {
      status: 'ready';
      items: NotificationView[];
      markReadFailureIds: string[];
      retryMarkRead: () => void;
      isFetchingNextPage: boolean;
      hasNextPage: boolean;
      fetchNextPage: () => void;
    };

export function useNotificationsPage(): NotificationsPageView {
  const queryClient = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: queryKeys.notificationsInbox(PAGE_SIZE),
    queryFn: ({ pageParam }) =>
      loadNotifications({ limit: PAGE_SIZE, before: pageParam ?? null }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextBefore : undefined),
  });
  const {
    enqueue,
    retry: retryMarkRead,
    failedIds: markReadFailureIds,
  } = useMarkNotificationsRead();

  useEffect(() => {
    if (!q.dataUpdatedAt) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.notificationsUnread,
    });
  }, [q.dataUpdatedAt, queryClient]);

  const items = q.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    enqueue(
      items
        .filter((notification) => notification.readAt === null)
        .map((notification) => notification.id),
    );
  }, [enqueue, items]);

  const fetchNextPage = useCallback(() => {
    void q.fetchNextPage();
  }, [q.fetchNextPage]);

  if (q.isError) {
    return {
      status: 'error',
      error: toAppError(q.error, 'notifications:page'),
    };
  }
  if (q.isLoading || !q.data) {
    return { status: 'loading' };
  }

  return {
    status: 'ready',
    items,
    markReadFailureIds,
    retryMarkRead,
    isFetchingNextPage: q.isFetchingNextPage,
    hasNextPage: Boolean(q.hasNextPage),
    fetchNextPage,
  };
}
