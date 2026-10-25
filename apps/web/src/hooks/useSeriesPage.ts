import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { queryKeys } from '../api/queryKeys.js';
import { useAuth } from '../auth/AuthContext.js';
import {
  currentAccessIdentity,
  useCurrentAccess,
} from '../auth/useCurrentAccess.js';
import { toAppError } from '../errors/toAppError.js';
import { TransportError } from '../errors/types.js';
import { useMe } from './useMe.js';
import {
  loadSeriesArc,
  loadSeriesAuthority,
  upsertSeriesArc,
  type SeriesView,
} from '../features/onboarding/adapters/seriesAdapter.js';
import { isSeriesIdentity } from '../features/onboarding/seriesIdentity.js';

type Attempt = {
  token: string | null;
  memberId: string;
  actorIdentity: string;
  target: string | null;
  name: string;
  key: string;
};

export function useSeriesPage(identity: string) {
  const validId = isSeriesIdentity(identity);
  const client = useQueryClient();
  const navigate = useNavigate();
  const me = useMe();
  const auth = useAuth();
  const admin = useCurrentAccess('admin');
  const token = auth.token;
  const actorIdentity = me.data ? currentAccessIdentity(me.data) : null;
  const current = (
    attempt: Pick<Attempt, 'token' | 'memberId' | 'actorIdentity'> | undefined,
  ): boolean => {
    const actor = client.getQueryState<NonNullable<typeof me.data>>(queryKeys.me);
    return Boolean(
      attempt &&
      auth.isCurrentSession(attempt.token) &&
      actor?.status === 'success' &&
      actor.data?.id === attempt.memberId &&
      currentAccessIdentity(actor.data) === attempt.actorIdentity,
    );
  };
  const session =
    me.data && actorIdentity
      ? { token, memberId: me.data.id, actorIdentity }
      : undefined;
  const arc = useQuery({
    queryKey: ['series', identity],
    queryFn: () => loadSeriesArc(identity),
    enabled: validId,
    retry: false,
  });
  const authorityKey = ['seriesAuthority', actorIdentity];
  const authority = useQuery({
    queryKey: authorityKey,
    notifyOnChangeProps: 'all',
    queryFn: async () => {
      if (!session || !current(session) || !me.data)
        throw toAppError({ failure: 'Unauthorized' }, 'series:session');
      const result = await loadSeriesAuthority(me.data.handle);
      if (!current(session) || result.memberId !== session.memberId)
        throw toAppError({ failure: 'Unauthorized' }, 'series:session');
      return result;
    },
    enabled: Boolean(session && current(session)),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const admission = (
    attempt: Pick<Attempt, 'token' | 'memberId' | 'actorIdentity'>,
    target: string | null,
  ): boolean => {
    if (!current(attempt)) return false;
    if (target) {
      const stored = client.getQueryState<SeriesView | null>(['series', identity]);
      return (
        stored?.status === 'success' &&
        stored.data?.id === target &&
        (stored.data.createdBy === attempt.memberId || admin.isCurrentProof())
      );
    }
    // Starting a series is a DM action: only an active, approved DM may, even
    // when the same member is also an admin or owner. Admins keep rename above.
    const proof =
      client.getQueryState<Awaited<ReturnType<typeof loadSeriesAuthority>>>(
        authorityKey,
      );
    return Boolean(
      proof?.status === 'success' &&
      proof.data?.memberId === attempt.memberId &&
      proof.data.canCreate,
    );
  };
  const pending = useRef<Attempt | null>(null);
  const keys = useRef<{
    token: string | null;
    actorIdentity: string;
    values: Map<string, string>;
  } | null>(null);
  const write = useMutation({
    mutationFn: async (attempt: Attempt) => {
      if (!current(attempt))
        throw toAppError({ failure: 'Unauthorized' }, 'series:session');
      if (!admission(attempt, attempt.target))
        throw toAppError(new TransportError('FORBIDDEN'), 'series:authority');
      return upsertSeriesArc(attempt.target, attempt.name, attempt.key);
    },
    retry: false,
    onSuccess: async (_value, attempt) => {
      if (current(attempt)) await client.invalidateQueries({ queryKey: ['series'] });
    },
    onError: (error, attempt) => {
      if (!current(attempt)) return;
      const app = toAppError(error, 'series:write');
      if (app.kind === 'forbidden' || app.kind === 'unauthorized') {
        void client.invalidateQueries({ queryKey: queryKeys.me });
        void client.invalidateQueries({ queryKey: ['seriesAuthority'] });
        void client.invalidateQueries({ queryKey: ['currentAccess'] });
      }
    },
  });
  const save = async (target: string | null, name: string, onSuccess?: () => void) => {
    const value = name.trim();
    if (
      !session ||
      !current(session) ||
      !admission(session, target) ||
      (pending.current && current(pending.current)) ||
      !value ||
      value.length > 200
    )
      return false;
    if (
      keys.current?.token !== token ||
      keys.current.actorIdentity !== session.actorIdentity
    )
      keys.current = { token, actorIdentity: session.actorIdentity, values: new Map() };
    const keySet = keys.current;
    const signature = JSON.stringify([target, value]);
    const key = keySet.values.get(signature) ?? crypto.randomUUID();
    keySet.values.set(signature, key);
    const attempt = { ...session, target, name: value, key };
    pending.current = attempt;
    try {
      const result = await write.mutateAsync(attempt);
      if (!current(attempt)) return false;
      keySet.values.delete(signature);
      onSuccess?.();
      if (!current(attempt)) return false;
      if (!target) navigate(`/series/${encodeURIComponent(result.id)}`);
      return true;
    } catch {
      return false;
    } finally {
      if (pending.current === attempt) pending.current = null;
    }
  };
  return {
    validId,
    arc,
    canCreate: Boolean(session && admission(session, null)),
    canRename: Boolean(
      session && arc.data && !arc.isError && admission(session, arc.data.id),
    ),
    pending: write.isPending && current(write.variables),
    error:
      write.error && current(write.variables)
        ? toAppError(write.error, 'series:write')
        : null,
    authorityError:
      session && current(session)
        ? authority.isError
          ? toAppError(authority.error, 'series:authority')
          : admin.status === 'error'
            ? admin.error
            : null
        : null,
    save,
    retry: () => {
      void arc.refetch();
    },
    retryAuthority: () => {
      void authority.refetch();
      admin.reload();
    },
  };
}
