import { useEffect, useRef, useState } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext.js';
import { queryKeys } from '../../../api/queryKeys.js';
import { useMe } from '../../../hooks/useMe.js';
import { toAppError } from '../../../errors/toAppError.js';
import {
  createCharacter,
  loadCreationOptions,
  type NewCharacterFields,
} from '../adapters/characterDirectoryAdapter.js';
export function useCharacterCreation() {
  const { token, isCurrentSession } = useAuth();
  const me = useMe();
  const [regionId, setRegionId] = useState('');
  const busy = useRef(false);
  const replay = useRef<{
    payload: string;
    key: string;
    input: NewCharacterFields;
    token: string | null;
    memberId: string;
  } | null>(null);
  const query = useQuery({
    queryKey: ['characterCreationOptions', regionId],
    queryFn: () => loadCreationOptions(regionId),
    // Keep the form mounted while a region change reloads its catalog.
    placeholderData: keepPreviousData,
  });
  const client = useQueryClient();
  const navigate = useNavigate();
  const current = (attempt: { token: string | null; memberId: string } | undefined) => {
    const account = client.getQueryState<NonNullable<typeof me.data>>(queryKeys.me);
    return Boolean(
      attempt &&
      isCurrentSession(attempt.token) &&
      account?.status === 'success' &&
      account.data?.id === attempt.memberId,
    );
  };
  const create = useMutation({
    mutationFn: (attempt: NonNullable<typeof replay.current>) => {
      if (!current(attempt))
        throw toAppError({ failure: 'Unauthorized' }, 'character:session');
      return createCharacter(attempt.input, attempt.key);
    },
    onSuccess: async (character, attempt) => {
      if (!current(attempt)) return;
      if (replay.current === attempt) replay.current = null;
      await client.invalidateQueries({ queryKey: ['characters'] });
      if (!current(attempt)) return;
      navigate(`/characters/${character.shortCode}`);
    },
    onSettled: (_value, _error, attempt) => {
      if (current(attempt)) busy.current = false;
    },
  });
  const reset = create.reset;
  const memberId = me.data?.id;
  useEffect(() => {
    replay.current = null;
    busy.current = false;
    reset();
  }, [token, memberId, reset]);
  const submit = (input: NewCharacterFields) => {
    if (!memberId || busy.current || !current({ token, memberId })) return;
    const payload = JSON.stringify(input);
    if (replay.current?.payload !== payload || replay.current.token !== token)
      replay.current = { payload, key: crypto.randomUUID(), input, token, memberId };
    busy.current = true;
    create.mutate(replay.current);
  };
  const active = current(create.variables);
  return {
    regionId,
    setRegionId,
    query,
    create: {
      ...create,
      mutate: submit,
      data: active ? create.data : undefined,
      error: active ? create.error : null,
      isError: active && create.isError,
      isSuccess: active && create.isSuccess,
      isPending: active && create.isPending,
    },
  };
}
