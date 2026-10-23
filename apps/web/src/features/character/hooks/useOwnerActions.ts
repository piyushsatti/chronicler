import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { useMe } from '../../../hooks/useMe.js';
import {
  retireCharacter,
  submitCharacterForVerification,
  updateCharacterProfile,
  syncCharacterDdb,
} from '../adapters/characterMutations.js';
import type { CharacterViewModel } from '../adapters/characterAdapter.js';
import { ddbUrlError } from '../ddbUrl.js';
import { imageUrlError } from '../../../utils/characterImageUrl.js';

type OwnerCommand =
  | {
      kind: 'profile';
      id: string;
      input: { description: string | null; imageUrl?: string | null };
    }
  | { kind: 'sync'; id: string; url: string }
  | { kind: 'submit' | 'retire'; id: string; version: string | null };
export function useOwnerActions({ character }: { character: CharacterViewModel }) {
  const { token, isCurrentSession } = useAuth();
  const me = useMe();
  const client = useQueryClient();
  const authorityRefreshed = useRef(false);
  const busy = useRef(false);
  const replay = useRef<{
    identity: string;
    key: string;
    command: OwnerCommand;
    token: string | null;
    memberId: string;
  } | null>(null);
  const [description, setDescription] = useState(character.description ?? '');
  const [ddbUrl, setDdbUrl] = useState(character.ddbUrl ?? '');
  const [imageUrl, setImageUrl] = useState(character.imageUrl ?? '');
  const [message, setMessage] = useState<{
    token: string | null;
    memberId: string;
    value: string;
  } | null>(null);
  const current = (
    attempt: { token: string | null; memberId: string } | null | undefined,
  ) => {
    const account = client.getQueryState<NonNullable<typeof me.data>>(queryKeys.me);
    return Boolean(
      attempt &&
      isCurrentSession(attempt.token) &&
      account?.status === 'success' &&
      account.data?.id === attempt.memberId &&
      attempt.memberId === character.ownerId,
    );
  };
  const refresh = async (attempt: { token: string | null; memberId: string }) => {
    if (!current(attempt)) return;
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.character(character.shortCode) }),
      client.invalidateQueries({ queryKey: queryKeys.character(character.id) }),
      client.invalidateQueries({ queryKey: ['characters'] }),
    ]);
  };
  const write = useMutation({
    mutationFn: async (attempt: NonNullable<typeof replay.current>) => {
      if (!current(attempt))
        throw toAppError({ failure: 'Unauthorized' }, 'character:session');
      const { command, key } = attempt;
      switch (command.kind) {
        case 'profile':
          await updateCharacterProfile(command.id, command.input, key);
          return 'Profile saved.';
        case 'sync': {
          const receipt = await syncCharacterDdb(command.id, command.url, key);
          if (receipt.succeeded) return 'D&D Beyond synchronized.';
          const reason =
            receipt.safeError === 'TIMEOUT'
              ? 'The provider timed out.'
              : receipt.safeError === 'PROVIDER_HTTP'
                ? 'The provider did not return a character.'
                : receipt.safeError === 'PAYLOAD_DRIFT'
                  ? 'The provider returned an unsupported character format.'
                  : 'The provider is unavailable.';
          return `${reason} Your saved profile and last synchronized data were kept.`;
        }
        case 'submit':
          if (!command.version)
            throw toAppError({ failure: 'InvalidWire' }, 'character:verification');
          await submitCharacterForVerification(command.id, command.version, key);
          return 'Submitted for verification.';
        case 'retire':
          if (!command.version)
            throw toAppError({ failure: 'InvalidWire' }, 'character:retire');
          await retireCharacter(command.id, command.version, key);
          return 'Character retired.';
        default: {
          const exhaustive: never = command;
          return exhaustive;
        }
      }
    },
    onMutate: (attempt) => {
      if (current(attempt)) setMessage(null);
    },
    onSuccess: async (result, attempt) => {
      if (!current(attempt)) return;
      if (replay.current === attempt) replay.current = null;
      setMessage({ token: attempt.token, memberId: attempt.memberId, value: result });
      await refresh(attempt);
    },
    onSettled: (_value, _error, attempt) => {
      if (current(attempt)) busy.current = false;
    },
    onError: async (error, attempt) => {
      if (!current(attempt)) return;
      if (
        toAppError(error, 'character:owner').kind === 'forbidden' &&
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
    setMessage(null);
    reset();
  }, [token, memberId, character.id, reset]);
  const submit = (command: OwnerCommand) => {
    if (!memberId || busy.current || !current({ token, memberId })) return;
    const identity = JSON.stringify(
      command.kind === 'submit' || command.kind === 'retire'
        ? [command.kind, command.id]
        : command,
    );
    if (replay.current?.identity !== identity || replay.current.token !== token)
      replay.current = { identity, key: crypto.randomUUID(), command, token, memberId };
    busy.current = true;
    write.mutate(replay.current);
  };
  return {
    description,
    setDescription,
    ddbUrl,
    setDdbUrl,
    imageUrl,
    setImageUrl,
    imageUrlError: imageUrlError(imageUrl),
    ddbUrlError: ddbUrl.trim() ? ddbUrlError(ddbUrl) : undefined,
    message: current(message) ? (message?.value ?? null) : null,
    pending: current(write.variables) && write.isPending,
    error:
      current(write.variables) && write.error
        ? toAppError(write.error, 'character:owner')
        : null,
    saveProfile: () => {
      if (imageUrlError(imageUrl)) return;
      const image = imageUrl.trim() || null;
      submit({
        kind: 'profile',
        id: character.id,
        input: {
          description: description.trim() || null,
          // The API keeps an omitted imageUrl and clears on null, so send it only
          // when the owner changed it.
          ...(image === (character.imageUrl ?? null) ? {} : { imageUrl: image }),
        },
      });
    },
    syncDdb: () => {
      if (ddbUrlError(ddbUrl)) return;
      submit({ kind: 'sync', id: character.id, url: ddbUrl.trim() });
    },
    submitForVerification: () =>
      submit({ kind: 'submit', id: character.id, version: character.updatedAt }),
    retire: () =>
      submit({ kind: 'retire', id: character.id, version: character.updatedAt }),
    reload: async () => {
      if (!memberId || !current({ token, memberId })) return;
      replay.current = null;
      await refresh({ token, memberId });
    },
  };
}
