import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import { pluralize } from '../../../utils/format.js';
import {
  acknowledgeSuppressedNotifications,
  loadNotifications,
} from '../adapters/notificationsAdapter.js';
import { useUnreadCount } from './useUnreadCount.js';
import {
  useNotificationSession,
  type NotificationSession,
} from './useNotificationSession.js';

type Acknowledgement = {
  session: NotificationSession;
  key: string;
  controller: AbortController;
};

export function useLoginNotifications(enabled: boolean) {
  const client = useQueryClient();
  const { session, isCurrent, requireCurrent, accountError, retryAccount } =
    useNotificationSession();
  const unreadQ = useUnreadCount(enabled);
  const listQ = useQuery({
    queryKey: [...queryKeys.notificationsPreview(20), session?.authority ?? null],
    queryFn: async ({ signal }) => {
      const active = requireCurrent(session);
      const page = await loadNotifications({
        limit: 20,
        session: { token: active.token, signal },
      });
      requireCurrent(active);
      return page;
    },
    enabled: enabled && session !== null,
    retry: false,
  });
  const attempt = useRef<Acknowledgement | null>(null);
  const busy = useRef(false);
  const [feedback, setFeedback] = useState<{
    session: NotificationSession;
    message: string;
  } | null>(null);
  const mutation = useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (request: Acknowledgement) => {
      requireCurrent(request.session);
      const receipt = await acknowledgeSuppressedNotifications({
        token: request.session.token,
        signal: request.controller.signal,
        idempotencyKey: request.key,
      });
      requireCurrent(request.session);
      return receipt;
    },
    onSuccess: async (receipt, request) => {
      if (!isCurrent(request.session)) return;
      if (attempt.current === request) attempt.current = null;
      setFeedback({
        session: request.session,
        message:
          receipt.affectedCount === 0
            ? 'There were no alerts for removed pages to clear.'
            : `Cleared ${pluralize(receipt.affectedCount, 'alert')} for removed pages.`,
      });
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.notifications }),
        client.invalidateQueries({ queryKey: queryKeys.notificationsUnread }),
      ]);
    },
    onSettled: (_data, _error, request) => {
      if (isCurrent(request.session)) busy.current = false;
    },
  });
  const reset = mutation.reset;
  useEffect(() => {
    attempt.current?.controller.abort();
    attempt.current = null;
    busy.current = false;
    setFeedback(null);
    reset();
    return () => {
      attempt.current?.controller.abort();
    };
  }, [session, reset]);

  return {
    unreadQ,
    listQ,
    accountError,
    ready: isCurrent(session),
    retry: () => {
      if (accountError) void retryAccount();
      else if (isCurrent(session)) {
        void unreadQ.refetch();
        void listQ.refetch();
      }
    },
    ack: {
      isPending: mutation.isPending && isCurrent(mutation.variables?.session ?? null),
      error:
        isCurrent(mutation.variables?.session ?? null) && mutation.error
          ? toAppError(mutation.error, 'notifications:ack')
          : null,
      feedback: feedback && isCurrent(feedback.session) ? feedback.message : null,
      mutate: () => {
        if (!session || busy.current || !isCurrent(session) || !enabled) return;
        const next = {
          session,
          key:
            attempt.current?.session === session
              ? attempt.current.key
              : crypto.randomUUID(),
          controller: new AbortController(),
        };
        attempt.current = next;
        busy.current = true;
        setFeedback(null);
        mutation.mutate(next);
      },
    },
  };
}
