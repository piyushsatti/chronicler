import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AppError } from '../../../errors/types.js';
import {
  retireCharacter,
  submitCharacterForVerification,
  updateCharacterProfile,
} from '../adapters/characterMutations.js';
import type { CharacterViewModel } from '../adapters/characterAdapter.js';

export type OwnerActionsView = {
  description: string;
  setDescription: (value: string) => void;
  ddbUrl: string;
  setDdbUrl: (value: string) => void;
  message: string | null;
  pending: boolean;
  error: AppError | null;
  saveProfile: () => void;
  submitForVerification: () => void;
  retire: () => void;
};

export function useOwnerActions({
  character,
}: {
  character: CharacterViewModel;
}): OwnerActionsView {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState(character.description ?? '');
  const [ddbUrl, setDdbUrl] = useState(character.ddbUrl ?? '');
  const [message, setMessage] = useState<string | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.character(character.shortCode),
    });
    await queryClient.invalidateQueries({
      queryKey: queryKeys.character(character.id),
    });
  };

  const saveProfile = useMutation({
    mutationFn: () =>
      updateCharacterProfile(character.id, {
        description: description.trim() || null,
        ddbUrl: ddbUrl.trim() || null,
      }),
    onSuccess: async () => {
      setMessage('Profile saved.');
      await invalidate();
    },
  });

  const submit = useMutation({
    mutationFn: () => submitCharacterForVerification(character.id),
    onSuccess: async () => {
      setMessage('Submitted for verification.');
      await invalidate();
    },
  });

  const retire = useMutation({
    mutationFn: () => retireCharacter(character.id),
    onSuccess: async () => {
      setMessage('Character retired.');
      await invalidate();
    },
  });

  const mutationError = saveProfile.error ?? submit.error ?? retire.error;
  return {
    description,
    setDescription,
    ddbUrl,
    setDdbUrl,
    message,
    pending: saveProfile.isPending || submit.isPending || retire.isPending,
    error: mutationError ? toAppError(mutationError, 'character:owner') : null,
    saveProfile: () => saveProfile.mutate(),
    submitForVerification: () => submit.mutate(),
    retire: () => retire.mutate(),
  };
}
