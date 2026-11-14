import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../api/queryKeys.js';
import { useMe } from '../hooks/useMe.js';
import { toAppError } from '../errors/toAppError.js';
import { useAuth } from './AuthContext.js';
import { readCurrentAccess, type CurrentAccessKind } from './currentAccessAdapter.js';

export function currentAccessIdentity(member: { id: string; roles: string[] }): string {
  return JSON.stringify([member.id, [...member.roles].sort()]);
}

export function useCurrentAccess(kind: CurrentAccessKind) {
  const auth = useAuth();
  const me = useMe();
  const client = useQueryClient();
  const identity = me.isSuccess ? currentAccessIdentity(me.data) : null;
  const token = auth.token;
  const key = queryKeys.currentAccess(kind, identity);
  const current = (): boolean => {
    const actor = client.getQueryState<NonNullable<typeof me.data>>(queryKeys.me);
    return (
      auth.sessionReady &&
      auth.isCurrentSession(token) &&
      actor?.status === 'success' &&
      actor.data !== undefined &&
      currentAccessIdentity(actor.data) === identity
    );
  };
  const proof = useQuery({
    queryKey: key,
    enabled: identity !== null && auth.sessionReady && auth.isCurrentSession(token),
    retry: false,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!current() || !token)
        throw toAppError({ failure: 'Unauthorized' }, 'access:session');
      const allowed = await readCurrentAccess(kind, token, signal);
      if (!current()) throw toAppError({ failure: 'Unauthorized' }, 'access:session');
      return allowed;
    },
  });
  const status = proof.isError
    ? 'error'
    : !identity || !current() || proof.isPending
      ? 'loading'
      : proof.data
        ? 'allowed'
        : 'forbidden';
  return {
    status,
    allowed: status === 'allowed',
    error: proof.isError ? toAppError(proof.error, 'access:proof') : null,
    reload: () => {
      void proof.refetch();
    },
    isCurrentProof: () =>
      current() &&
      client.getQueryState<boolean>(key)?.status === 'success' &&
      client.getQueryData<boolean>(key) === true,
  };
}
