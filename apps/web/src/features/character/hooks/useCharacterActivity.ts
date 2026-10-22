import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { useMe } from '../../../hooks/useMe.js';
import {
  ACTIVITY_PAGE_SIZE,
  loadCharacterActivity,
  writeCharacterActivity,
  type ActivityCommand,
} from '../adapters/characterActivityAdapter.js';
export function useCharacterActivity(characterId: string) {
  const { token, isCurrentSession } = useAuth();
  const me = useMe();
  const [page, setPage] = useState(1);
  const client = useQueryClient();
  const authorityRefreshed = useRef(false);
  const busy = useRef(false);
  const replay = useRef<{
    payload: string;
    key: string;
    characterId: string;
    command: ActivityCommand;
    token: string | null;
    memberId: string;
  } | null>(null);
  const query = useQuery({
    queryKey: ['characterActivity', characterId, page],
    queryFn: () => loadCharacterActivity(characterId, (page - 1) * ACTIVITY_PAGE_SIZE),
  });
  const current = (attempt: { token: string | null; memberId: string } | undefined) => {
    const account = client.getQueryState<NonNullable<typeof me.data>>(queryKeys.me);
    return Boolean(
      attempt &&
      isCurrentSession(attempt.token) &&
      account?.status === 'success' &&
      account.data?.id === attempt.memberId,
    );
  };
  const write = useMutation({
    mutationFn: (attempt: NonNullable<typeof replay.current>) => {
      if (!current(attempt))
        throw toAppError({ failure: 'Unauthorized' }, 'character:session');
      return writeCharacterActivity(attempt.characterId, attempt.command, attempt.key);
    },
    onSuccess: async (_value, attempt) => {
      if (!current(attempt)) return;
      if (replay.current === attempt) replay.current = null;
      await Promise.all([
        client.invalidateQueries({ queryKey: ['characterActivity', characterId] }),
        client.invalidateQueries({
          queryKey: queryKeys.characterProgression(characterId),
        }),
        client.invalidateQueries({ queryKey: ['character'] }),
      ]);
    },
    onSettled: (_value, _error, attempt) => {
      if (current(attempt)) busy.current = false;
    },
    onError: async (error, attempt) => {
      if (!current(attempt)) return;
      if (
        toAppError(error, 'character:activity').kind === 'forbidden' &&
        !authorityRefreshed.current
      ) {
        authorityRefreshed.current = true;
        await client.invalidateQueries({ queryKey: queryKeys.me });
      }
    },
  });
  const reset = write.reset;
  const memberId = me.data?.id;
  useEffect(() => {
    replay.current = null;
    busy.current = false;
    authorityRefreshed.current = false;
    reset();
  }, [token, memberId, characterId, reset]);
  const submit = (command: ActivityCommand, options?: { onSuccess: () => void }) => {
    if (!memberId || busy.current || !current({ token, memberId })) return;
    const payload = JSON.stringify([characterId, command]);
    if (replay.current?.payload !== payload || replay.current.token !== token)
      replay.current = {
        payload,
        key: crypto.randomUUID(),
        characterId,
        command,
        token,
        memberId,
      };
    busy.current = true;
    write.mutate(replay.current, {
      onSuccess: (_value, attempt) => {
        if (current(attempt)) options?.onSuccess();
      },
    });
  };
  const active = current(write.variables);
  return {
    query,
    retry: () => void query.refetch(),
    write: {
      ...write,
      mutate: submit,
      data: active ? write.data : undefined,
      error: active ? write.error : null,
      isError: active && write.isError,
      isSuccess: active && write.isSuccess,
      isPending: active && write.isPending,
    },
    page,
    setPage,
    pageSize: ACTIVITY_PAGE_SIZE,
  };
}
