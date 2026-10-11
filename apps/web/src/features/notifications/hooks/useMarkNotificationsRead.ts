import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onlineManager, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useMe } from '../../../hooks/useMe.js';
import { markNotificationsRead } from '../adapters/notificationsAdapter.js';

type ReadState = 'queued' | 'in-flight' | 'succeeded' | 'failed' | 'unsent';
type ReadOwner = {
  token: string | null;
  authority: string | null;
  active: boolean;
  running: boolean;
  generation: number;
  controller: AbortController | null;
  ids: Map<string, ReadState>;
};

function authorityKey(
  member: { id: string; roles: string[] } | undefined,
): string | null {
  return member ? JSON.stringify([member.id, [...new Set(member.roles)].sort()]) : null;
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  const { token, isCurrentSession } = useAuth();
  const me = useMe();
  const authority = me.isSuccess ? authorityKey(me.data) : null;
  const owner = useMemo<ReadOwner>(
    () => ({
      token,
      authority,
      active: false,
      running: false,
      generation: 0,
      controller: null,
      ids: new Map(),
    }),
    [token, authority],
  );
  const current = useRef(owner);
  const [, refresh] = useState(0);
  const isCurrentOwner = useCallback(
    (candidate: ReadOwner): boolean => {
      const account = queryClient.getQueryState<NonNullable<typeof me.data>>(
        queryKeys.me,
      );
      return (
        current.current === candidate &&
        candidate.active &&
        isCurrentSession(candidate.token) &&
        candidate.authority !== null &&
        account?.status === 'success' &&
        authorityKey(account.data) === candidate.authority
      );
    },
    [isCurrentSession, queryClient],
  );
  const publish = useCallback((candidate: ReadOwner) => {
    if (current.current === candidate && candidate.active)
      refresh((value) => value + 1);
  }, []);
  const stop = useCallback(
    (candidate: ReadOwner) => {
      candidate.generation += 1;
      candidate.controller?.abort();
      for (const [id, state] of candidate.ids) {
        if (state === 'queued') candidate.ids.set(id, 'unsent');
        if (state === 'in-flight') candidate.ids.set(id, 'failed');
      }
      publish(candidate);
    },
    [publish],
  );

  useEffect(() => {
    current.current = owner;
    owner.active = true;
    const unsubscribe = onlineManager.subscribe((online) => {
      if (!online) stop(owner);
    });
    return () => {
      owner.active = false;
      owner.generation += 1;
      owner.controller?.abort();
      owner.ids.clear();
      unsubscribe();
    };
  }, [owner, stop]);

  const { mutateAsync } = useMutation({
    // The feature owns offline/unsent state; never resume a paused old-session mutation.
    networkMode: 'always',
    retry: false,
    mutationFn: async (request: {
      owner: ReadOwner;
      generation: number;
      ids: string[];
      signal: AbortSignal;
    }) => {
      if (
        !isCurrentOwner(request.owner) ||
        request.owner.generation !== request.generation ||
        request.signal.aborted ||
        !request.owner.token
      ) {
        throw toAppError({ failure: 'Unauthorized' }, 'notifications:mark-read');
      }
      await markNotificationsRead(request.ids, {
        token: request.owner.token,
        signal: request.signal,
      });
    },
  });

  const drain = useCallback(
    async (candidate: ReadOwner): Promise<void> => {
      if (candidate.running || !isCurrentOwner(candidate)) return;
      candidate.running = true;
      const generation = candidate.generation;
      try {
        while (isCurrentOwner(candidate) && candidate.generation === generation) {
          const ids = Array.from(candidate.ids)
            .filter(([, state]) => state === 'queued')
            .slice(0, 100)
            .map(([id]) => id);
          if (ids.length === 0) break;
          if (!onlineManager.isOnline()) {
            stop(candidate);
            break;
          }
          ids.forEach((id) => candidate.ids.set(id, 'in-flight'));
          const controller = new AbortController();
          candidate.controller = controller;
          try {
            await mutateAsync({
              owner: candidate,
              generation,
              ids,
              signal: controller.signal,
            });
          } catch {
            if (!isCurrentOwner(candidate) || candidate.generation !== generation)
              break;
            ids.forEach((id) => candidate.ids.set(id, 'failed'));
            publish(candidate);
            continue;
          }
          if (!isCurrentOwner(candidate) || candidate.generation !== generation) break;
          ids.forEach((id) => candidate.ids.set(id, 'succeeded'));
          publish(candidate);
          // Acknowledged batches stay succeeded even if a later cache refresh fails.
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.notificationsUnread }),
            queryClient.invalidateQueries({ queryKey: queryKeys.notifications }),
          ]).catch(() => undefined);
        }
      } finally {
        candidate.running = false;
        candidate.controller = null;
        if (
          isCurrentOwner(candidate) &&
          Array.from(candidate.ids.values()).includes('queued')
        ) {
          if (onlineManager.isOnline()) void drain(candidate);
          else stop(candidate);
        }
      }
    },
    [isCurrentOwner, mutateAsync, publish, queryClient, stop],
  );

  const enqueue = useCallback(
    (ids: readonly string[]) => {
      if (!isCurrentOwner(owner)) return;
      let added = false;
      for (const value of ids) {
        const id = value.toLowerCase();
        if (!owner.ids.has(id)) {
          owner.ids.set(id, onlineManager.isOnline() ? 'queued' : 'unsent');
          added = true;
        }
      }
      if (onlineManager.isOnline()) void drain(owner);
      else if (added) publish(owner);
    },
    [drain, isCurrentOwner, owner, publish],
  );
  const retry = useCallback(() => {
    if (!isCurrentOwner(owner) || !onlineManager.isOnline()) return;
    for (const [id, state] of owner.ids) {
      if (state === 'failed' || state === 'unsent') owner.ids.set(id, 'queued');
    }
    publish(owner);
    void drain(owner);
  }, [drain, isCurrentOwner, owner, publish]);

  return {
    enqueue,
    retry,
    failedIds: Array.from(owner.ids)
      .filter(([, state]) => state === 'failed' || state === 'unsent')
      .map(([id]) => id),
  };
}
