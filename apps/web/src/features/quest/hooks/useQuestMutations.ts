import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import {
  closeQuest,
  signupForQuest,
  transitionQuest,
} from '../adapters/questAdapter.js';

export function useQuestMutations(shortCode: string, questId: string) {
  const client = useQueryClient();
  const invalidated403 = useRef(false);

  const invalidate = async (): Promise<void> => {
    await client.invalidateQueries({ queryKey: queryKeys.quest(shortCode) });
    await client.invalidateQueries({ queryKey: queryKeys.questBoard });
    await client.invalidateQueries({ queryKey: queryKeys.questLists });
  };

  const onError = (err: unknown): void => {
    const app = toAppError(err, 'quest:mutation');
    if (app.kind === 'forbidden' && !invalidated403.current) {
      invalidated403.current = true;
      void client.invalidateQueries({ queryKey: queryKeys.me });
    }
  };

  const signup = useMutation({
    mutationFn: (characterId: string) => signupForQuest(questId, characterId),
    onSuccess: invalidate,
    onError,
  });

  const transition = useMutation({
    mutationFn: (to: 'open' | 'full' | 'played' | 'cancelled') =>
      transitionQuest(questId, to),
    onSuccess: invalidate,
    onError,
  });

  const close = useMutation({
    mutationFn: () => closeQuest(questId),
    onSuccess: invalidate,
    onError,
  });

  return { signup, transition, close };
}
