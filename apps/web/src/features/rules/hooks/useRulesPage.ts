import { useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { useAuth } from '../../../auth/AuthContext.js';
import {
  currentAccessIdentity,
  useCurrentAccess,
} from '../../../auth/useCurrentAccess.js';
import { useMe } from '../../../hooks/useMe.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { loadRulesHub, type RulesHubView } from '../adapters/rulesAdapter.js';

type PageData<T> =
  | { status: 'loading' }
  | { status: 'error'; error: AppError; refetch: () => void }
  | { status: 'empty'; canCreate: boolean }
  | { status: 'ready'; view: T; canCreate: boolean };

export function useRulesPage(): PageData<RulesHubView> {
  const client = useQueryClient();
  const auth = useAuth();
  const me = useMe();
  const reviewAccess = useCurrentAccess('review');
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
    queryKey: [...queryKeys.rulesHub, authority],
    enabled: isCurrent(session),
    retry: false,
    queryFn: ({ signal }) => {
      const captured = session;
      if (!captured) throw toAppError({ failure: 'Unauthorized' }, 'rules:session');
      const assertCurrent = () => {
        if (!isCurrent(captured))
          throw toAppError({ failure: 'Unauthorized' }, 'rules:session');
      };
      assertCurrent();
      return loadRulesHub({ token: captured.token, signal, assertCurrent });
    },
  });
  const refetch = () => {
    if (me.isError) void me.refetch();
    else if (isCurrent(session)) void q.refetch();
  };
  if (me.isError)
    return {
      status: 'error',
      error: toAppError(me.error, 'rules:account'),
      refetch,
    };
  if (q.isError) {
    return { status: 'error', error: toAppError(q.error, 'rules:hub-page'), refetch };
  }
  if (!isCurrent(session) || q.isLoading || q.data === undefined)
    return { status: 'loading' };
  if (q.data.guides.length === 0 && q.data.rulings.length === 0) {
    return { status: 'empty', canCreate: reviewAccess.allowed };
  }
  return { status: 'ready', view: q.data, canCreate: reviewAccess.allowed };
}
