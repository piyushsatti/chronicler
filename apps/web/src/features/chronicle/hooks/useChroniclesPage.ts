import { useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { canCreateRecord } from '../../../auth/createRules.js';
import { currentAccessIdentity } from '../../../auth/useCurrentAccess.js';
import { useLiveDm } from '../../../hooks/useLiveDm.js';
import { useMe } from '../../../hooks/useMe.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  loadChronicleList,
  type ChronicleListView,
} from '../adapters/chronicleAdapter.js';

type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError; refetch: () => void }
  | { status: 'empty'; view: T }
  | { status: 'ready'; view: T; refetch: () => void };

export function useChroniclesPage(): PageData<ChronicleListView> {
  const client = useQueryClient();
  const auth = useAuth();
  const me = useMe();
  const authority =
    auth.token === null ? 'guest' : me.isSuccess ? currentAccessIdentity(me.data) : null;
  const session = useMemo(
    () => (authority === null ? null : { token: auth.token, authority }),
    [auth.token, authority],
  );
  const current = useRef(session);
  current.current = session;
  function isCurrent(candidate: typeof session): boolean {
    if (!candidate || candidate !== current.current || !auth.sessionReady) return false;
    if (candidate.token === null) return auth.token === null;
    if (!auth.isCurrentSession(candidate.token)) return false;
    const account = client.getQueryState<NonNullable<typeof me.data>>(queryKeys.me);
    return (
      account?.status === 'success' &&
      account.data !== undefined &&
      currentAccessIdentity(account.data) === candidate.authority
    );
  }
  const q = useQuery({
    queryKey: [...queryKeys.chronicleList, authority],
    enabled: isCurrent(session),
    retry: false,
    queryFn: ({ signal }) => {
      const captured = session;
      if (!captured) throw toAppError({ failure: 'Unauthorized' }, 'chronicle:session');
      const assertCurrent = () => {
        if (!isCurrent(captured))
          throw toAppError({ failure: 'Unauthorized' }, 'chronicle:session');
      };
      assertCurrent();
      return loadChronicleList({ token: captured.token, signal, assertCurrent });
    },
  });
  const refetch = () => {
    if (me.isError) void me.refetch();
    else if (isCurrent(session)) void q.refetch();
  };
  if (me.isError)
    return {
      status: 'error',
      error: toAppError(me.error, 'chronicle:account'),
      refetch,
    };
  if (q.isError) {
    return {
      status: 'error',
      error: toAppError(q.error, 'chronicle:list-page'),
      refetch,
    };
  }
  if (!isCurrent(session) || q.isLoading || q.data === undefined)
    return { status: 'loading' };
  if (q.data.items.length === 0) return { status: 'empty', view: q.data };
  return { status: 'ready', view: q.data, refetch };
}

/** "+ New entry" is offered only to accounts the summary editor will let write. */
export function useCanCreateSummary(): boolean {
  const { isAuthenticated } = useAuth();
  const me = useMe();
  const liveDm = useLiveDm();
  if (!isAuthenticated || !me.data) return false;
  return canCreateRecord('summary', {
    roles: me.data.roles,
    liveDm: liveDm.status === 'ready' && liveDm.liveDm,
  });
}
