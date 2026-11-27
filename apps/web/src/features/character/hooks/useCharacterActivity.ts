import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { useCommandFence } from '../../../hooks/useFencedMutation.js';
import { useMe } from '../../../hooks/useMe.js';
import {
  ACTIVITY_PAGE_SIZE,
  loadCharacterActivity,
  writeCharacterActivity,
  type ActivityCommand,
} from '../adapters/characterActivityAdapter.js';
type Attempt = {
  characterId: string;
  command: ActivityCommand;
  token: string | null;
  memberId: string;
};
export function useCharacterActivity(characterId: string) {
  const { token, isCurrentSession } = useAuth();
  const me = useMe();
  const [page, setPage] = useState(1);
  const client = useQueryClient();
  const authorityRefreshed = useRef(false);
  const busy = useRef(false);
  const fence = useCommandFence('character:session');
  const query = useQuery({
    queryKey: queryKeys.characterActivity(characterId, page),
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
    mutationFn: (attempt: Attempt) => {
      if (!current(attempt))
        throw toAppError({ failure: 'Unauthorized' }, 'character:session');
      return fence.runExclusive((cmd) =>
        writeCharacterActivity(attempt.characterId, attempt.command, {
          token: cmd.token,
          idempotencyKey: cmd.keyFor(JSON.stringify([attempt.characterId, attempt.command])),
          signal: cmd.signal,
        }),
      );
    },
    onSuccess: async (_value, attempt) => {
      if (!current(attempt)) return;
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.characterActivity(characterId) }),
        client.invalidateQueries({
          queryKey: queryKeys.characterProgression(characterId),
        }),
        client.invalidateQueries({ queryKey: queryKeys.characterAll }),
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
    busy.current = false;
    authorityRefreshed.current = false;
    reset();
  }, [token, memberId, characterId, reset]);
  const submit = (command: ActivityCommand, options?: { onSuccess: () => void }) => {
    if (!memberId || busy.current || !current({ token, memberId })) return;
    busy.current = true;
    write.mutate({ characterId, command, token, memberId }, {
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
