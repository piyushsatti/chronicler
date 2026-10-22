import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import { useMe } from '../../../hooks/useMe.js';
import { loadMemberProfile } from '../adapters/memberProfileAdapter.js';
import {
  writeProfileCommand,
  type ProfileCommand,
} from '../adapters/profileMutations.js';
type Session = { token: string | null; memberId: string };
type Attempt = Session & { identity: string; key: string; command: ProfileCommand };
export function useProfileActions(handle: string) {
  const client = useQueryClient();
  const { token, isCurrentSession } = useAuth();
  const me = useMe();
  const busy = useRef(false);
  const authorityRefreshed = useRef(false);
  const replay = useRef<Attempt | null>(null);
  const [message, setMessage] = useState<(Session & { value: string }) | null>(null);
  const [reloadError, setReloadError] = useState<
    (Session & { error: AppError }) | null
  >(null);
  const [reloading, setReloading] = useState(false);
  const current = (session: Session | null | undefined) => {
    if (!session || !isCurrentSession(session.token)) return false;
    const account = client.getQueryState<NonNullable<typeof me.data>>(queryKeys.me);
    return account?.status === 'success' && account.data?.id === session.memberId;
  };
  const refresh = async (session: Session) => {
    if (!current(session)) return;
    await Promise.all([
      client.invalidateQueries({ queryKey: ['memberProfile', handle] }),
      client.invalidateQueries({ queryKey: ['communityHub'] }),
      client.invalidateQueries({ queryKey: ['communityMembers'] }),
      client.invalidateQueries({ queryKey: queryKeys.me }),
    ]);
  };
  const mutation = useMutation({
    mutationFn: (attempt: Attempt) => {
      if (!current(attempt))
        throw toAppError({ failure: 'Unauthorized' }, 'profile:session');
      return writeProfileCommand(attempt.command, attempt.key);
    },
    onMutate: (attempt) => {
      if (!current(attempt)) return;
      setMessage(null);
      setReloadError(null);
    },
    onSuccess: async (value, attempt) => {
      if (!current(attempt)) return;
      if (replay.current === attempt) replay.current = null;
      setMessage({ token: attempt.token, memberId: attempt.memberId, value });
      await refresh(attempt);
    },
    onError: async (error, attempt) => {
      if (!current(attempt)) return;
      if (
        toAppError(error, 'profile:write').kind === 'forbidden' &&
        !authorityRefreshed.current
      ) {
        authorityRefreshed.current = true;
        await client.invalidateQueries({ queryKey: queryKeys.me });
      }
    },
    onSettled: (_value, _error, attempt) => {
      if (current(attempt)) busy.current = false;
    },
  });
  const resetMutation = mutation.reset;
  const memberId = me.data?.id;
  useEffect(() => {
    replay.current = null;
    busy.current = false;
    authorityRefreshed.current = false;
    setMessage(null);
    setReloadError(null);
    setReloading(false);
    resetMutation();
  }, [token, memberId, resetMutation]);
  const execute = (command: ProfileCommand) => {
    const session = { token, memberId: command.memberId };
    if (busy.current || memberId !== command.memberId || !current(session)) return;
    const identity = JSON.stringify(
      command.kind === 'submit' ? [command.kind, command.memberId] : command,
    );
    if (replay.current?.identity !== identity || replay.current.token !== token)
      replay.current = { ...session, identity, key: crypto.randomUUID(), command };
    busy.current = true;
    mutation.mutate(replay.current);
  };
  return {
    execute,
    pending: mutation.isPending || reloading,
    message: current(message) ? (message?.value ?? null) : null,
    error:
      current(reloadError) && reloadError
        ? reloadError.error
        : current(mutation.variables) && mutation.error
          ? toAppError(mutation.error, 'profile:write')
          : null,
    reload: async () => {
      if (!memberId) return;
      const session = { token, memberId };
      if (busy.current || !current(session)) return;
      busy.current = true;
      setReloading(true);
      try {
        const profile = await client.fetchQuery({
          queryKey: ['memberProfile', handle],
          queryFn: async () => {
            if (!current(session))
              throw toAppError({ failure: 'Unauthorized' }, 'profile:session');
            const loaded = await loadMemberProfile(handle);
            if (!current(session))
              throw toAppError({ failure: 'Unauthorized' }, 'profile:session');
            return loaded;
          },
          staleTime: 0,
        });
        if (!current(session)) return;
        replay.current = null;
        mutation.reset();
        setMessage(null);
        setReloadError(null);
        return profile;
      } catch (error) {
        if (current(session))
          setReloadError({ ...session, error: toAppError(error, 'profile:reload') });
      } finally {
        if (current(session)) {
          busy.current = false;
          setReloading(false);
        }
      }
    },
  };
}
