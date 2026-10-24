import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadNotifications } from '../adapters/notificationsAdapter.js';
import type { NotificationView } from '../types.js';
import { useMarkNotificationsRead } from './useMarkNotificationsRead.js';
import {
  useNotificationSession,
  type NotificationSession,
} from './useNotificationSession.js';

const PAGE_SIZE = 20;

type NotificationsPageView =
  | { status: 'loading' }
  | { status: 'error'; error: AppError; retry: () => void }
  | {
      status: 'ready';
      items: NotificationView[];
      markReadFailureIds: string[];
      markReadSuccessCount: number;
      loadMoreError: AppError | null;
      retryMarkRead: () => void;
      isFetchingNextPage: boolean;
      hasNextPage: boolean;
      fetchNextPage: () => void;
      markRead: (ids: readonly string[]) => void;
      markAllRead: () => void;
    };

export function useNotificationsPage({ markOnView = true, enabled = true }: { markOnView?: boolean; enabled?: boolean } = {}): NotificationsPageView {
  const queryClient = useQueryClient();
  const { session, isCurrent, requireCurrent, accountError, retryAccount } =
    useNotificationSession();
  const [unreadSnapshot, setUnreadSnapshot] = useState<{
    session: NotificationSession;
    ids: ReadonlySet<string>;
  } | null>(null);
  const [manuallyRead, setManuallyRead] = useState<{
    session: NotificationSession;
    ids: ReadonlySet<string>;
  } | null>(null);
  const q = useInfiniteQuery({
    queryKey: [...queryKeys.notificationsInbox(PAGE_SIZE), session?.authority ?? null],
    queryFn: async ({ pageParam, signal }) => {
      const active = requireCurrent(session);
      const page = await loadNotifications({
        limit: PAGE_SIZE,
        before: pageParam ?? null,
        session: { token: active.token, signal },
      });
      requireCurrent(active);
      return page;
    },
    enabled: enabled && session !== null,
    retry: false,
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.nextBefore : undefined),
  });
  const {
    enqueue,
    retry: retryMarkRead,
    failedIds: markReadFailureIds,
    succeededIds,
  } = useMarkNotificationsRead();

  useEffect(() => {
    if (!q.dataUpdatedAt || !isCurrent(session)) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.notificationsUnread,
    });
  }, [q.dataUpdatedAt, queryClient, isCurrent, session]);

  const items = useMemo(() => {
    const unique = new Map<string, NotificationView>();
    for (const page of q.data?.pages ?? [])
      for (const item of page.items) {
        if (!unique.has(item.id)) unique.set(item.id, item);
      }
    return [...unique.values()];
  }, [q.data]);

  if (unreadSnapshot && unreadSnapshot.session !== session) {
    setUnreadSnapshot(null);
  } else if (!unreadSnapshot && session && isCurrent(session) && q.data) {
    setUnreadSnapshot({
      session,
      ids: new Set(items.filter((item) => item.unread).map((item) => item.id)),
    });
  }
  if (manuallyRead && manuallyRead.session !== session) setManuallyRead(null);

  useEffect(() => {
    if (markOnView) enqueue(items.filter((notification) => notification.readAt === null).map((notification) => notification.id));
  }, [enqueue, items, markOnView]);

  const fetchNextPage = useCallback(() => {
    if (isCurrent(session)) void q.fetchNextPage();
  }, [q.fetchNextPage, isCurrent, session]);
  const markRead = useCallback((values: readonly string[]) => {
    if (!session || !isCurrent(session)) return;
    const ids = new Set(values);
    if (ids.size === 0) return;
    setManuallyRead((current) => ({
      session,
      ids: new Set([...(current?.session === session ? current.ids : []), ...ids]),
    }));
    setUnreadSnapshot((current) => current?.session === session
      ? { session, ids: new Set([...current.ids].filter((id) => !ids.has(id))) }
      : current);
    enqueue([...ids]);
  }, [enqueue, isCurrent, session]);

  const markAllRead = useCallback(async () => {
    if (!session || !isCurrent(session)) return;
    let pages = q.data?.pages ?? [];
    while (pages.at(-1)?.hasMore && isCurrent(session)) {
      const result = await q.fetchNextPage();
      if (!result.data || result.isFetchNextPageError) return;
      pages = result.data.pages;
    }
    const ids = new Set(pages.flatMap((page) => page.items).filter((notification) => notification.readAt === null).map((notification) => notification.id));
    markRead([...ids]);
  }, [isCurrent, markRead, q.data, q.fetchNextPage, session]);

  useEffect(() => {
    if (markOnView) return;
    setManuallyRead((current) => {
      if (current?.session !== session) return current;
      const failed = new Set(markReadFailureIds);
      if (![...failed].some((id) => current.ids.has(id))) return current;
      return { session, ids: new Set([...current.ids].filter((id) => !failed.has(id))) };
    });
  }, [markOnView, markReadFailureIds, session]);

  if (accountError || (q.isError && !q.isFetchNextPageError)) {
    return {
      status: 'error',
      error: toAppError(accountError ?? q.error, 'notifications:page'),
      retry: () => {
        if (accountError) void retryAccount();
        else if (isCurrent(session)) void q.refetch();
      },
    };
  }
  if (!isCurrent(session) || q.isLoading || !q.data) {
    return { status: 'loading' };
  }

  return {
    status: 'ready',
    items: items.map((item) => ({
      ...item,
      unread: markOnView ? (unreadSnapshot?.ids.has(item.id) ?? false) : (item.unread && !(manuallyRead?.session === session && manuallyRead.ids.has(item.id))),
    })),
    markReadFailureIds,
    markReadSuccessCount: succeededIds.length,
    loadMoreError: q.isFetchNextPageError
      ? toAppError(q.error, 'notifications:more')
      : null,
    retryMarkRead,
    isFetchingNextPage: q.isFetchingNextPage,
    hasNextPage: Boolean(q.hasNextPage),
    fetchNextPage,
    markRead,
    markAllRead,
  };
}
