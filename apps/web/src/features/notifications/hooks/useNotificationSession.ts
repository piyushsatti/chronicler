import { useCallback, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { currentAccessIdentity } from '../../../auth/useCurrentAccess.js';
import { useMe } from '../../../hooks/useMe.js';
import { toAppError } from '../../../errors/toAppError.js';

export type NotificationSession = { token: string; authority: string };

export function useNotificationSession() {
  const client = useQueryClient();
  const { token, isCurrentSession } = useAuth();
  const me = useMe();
  const authority = me.isSuccess ? currentAccessIdentity(me.data) : null;
  const session = useMemo<NotificationSession | null>(
    () => (token && authority ? { token, authority } : null),
    [token, authority],
  );
  const current = useRef(session);
  current.current = session;
  const isCurrent = useCallback(
    (candidate: NotificationSession | null) => {
      if (
        !candidate ||
        candidate !== current.current ||
        !isCurrentSession(candidate.token)
      )
        return false;
      const account = client.getQueryState<NonNullable<typeof me.data>>(queryKeys.me);
      return (
        account?.status === 'success' &&
        account.data !== undefined &&
        currentAccessIdentity(account.data) === candidate.authority
      );
    },
    [client, isCurrentSession],
  );
  const requireCurrent = useCallback(
    (candidate: NotificationSession | null) => {
      if (!candidate || !isCurrent(candidate))
        throw toAppError({ failure: 'Unauthorized' }, 'notifications:session');
      return candidate;
    },
    [isCurrent],
  );
  return {
    session,
    isCurrent,
    requireCurrent,
    accountError: me.isError ? me.error : null,
    retryAccount: me.refetch,
  };
}
