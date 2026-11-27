import { useRef, useState } from 'react';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext.js';
import { queryKeys } from '../../../api/queryKeys.js';
import { useCommandFence } from '../../../hooks/useFencedMutation.js';
import { useMe } from '../../../hooks/useMe.js';
import { toAppError } from '../../../errors/toAppError.js';
import {
  createCharacter,
  loadCreationOptions,
  type NewCharacterFields,
} from '../adapters/characterDirectoryAdapter.js';
type Attempt = { input: NewCharacterFields; token: string | null; memberId: string };
export function useCharacterCreation() {
  const { token, isCurrentSession } = useAuth();
  const me = useMe();
  const [regionId, setRegionId] = useState('');
  const busy = useRef(false);
  const fence = useCommandFence('character:session');
  const query = useQuery({
    queryKey: queryKeys.characterCreationOptions(regionId),
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
    mutationFn: (attempt: Attempt) => {
      if (!current(attempt))
        throw toAppError({ failure: 'Unauthorized' }, 'character:session');
      return fence.runExclusive((cmd) =>
        createCharacter(attempt.input, {
          token: cmd.token,
          idempotencyKey: cmd.keyFor(JSON.stringify(attempt.input)),
          signal: cmd.signal,
        }),
      );
    },
    onSuccess: async (character, attempt) => {
      if (!current(attempt)) return;
      await client.invalidateQueries({ queryKey: queryKeys.charactersAll });
      if (!current(attempt)) return;
      navigate(`/characters/${character.shortCode}`);
    },
    onSettled: (_value, _error, attempt) => {
      if (current(attempt)) busy.current = false;
    },
  });
  const memberId = me.data?.id;
  const submit = (input: NewCharacterFields) => {
    if (!memberId || busy.current || !current({ token, memberId })) return;
    busy.current = true;
    create.mutate({ input, token, memberId });
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
