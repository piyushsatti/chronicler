import { TransportError } from '../../../errors/types.js';
import { useAdminPage } from './useAdminPage.js';
import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import {
  decideCharacterVerification,
  loadCharVerifyQueue,
} from '../adapters/adminAdapter.js';

export function useCharacterVerifyTab() {
  const authority = useAdminAuthority('review');
  const queryClient = useQueryClient();
  const { query: queue, pagination } = useAdminPage(
    queryKeys.pendingCharacters,
    authority,
    {},
    (page, request) => loadCharVerifyQueue(page, request),
  );
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const decide = useMutation<
    void,
    unknown,
    Parameters<typeof decideCharacterVerification>[0]
  >({
    mutationKey: ['adminCommand', authority.commandKey, 'useCharacterVerifyTab'],
    networkMode: 'always',
    retry: false,
    mutationFn: authority.guardMutation(
      (command, input: Parameters<typeof decideCharacterVerification>[0]) =>
        decideCharacterVerification(input, command),
    ),
    onSuccess: async (_data, vars) => {
      if (!authority.isCurrent()) return;
      setFeedback({
        type: 'success',
        message: vars.approve ? 'Character approved.' : 'Character rejected.',
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.pendingCharacters });
    },
    onError: (error, vars) => {
      if (!authority.isCurrent()) return;
      const appError = toAppError(error, 'review:character-decision');
      const isStale =
        appError.cause instanceof TransportError && appError.cause.code === 'CONFLICT';
      setFeedback({
        type: 'error',
        message:
          appError.kind === 'forbidden' || appError.kind === 'unauthorized'
            ? appError.userMessage
            : isStale
              ? 'This character changed while you were reviewing it. Refresh the queue and try again.'
              : vars.approve
                ? 'Could not approve this character. Please try again.'
                : 'Could not reject this character. Please try again.',
      });
    },
  });
  useAuthorityFailures(queue.error, decide.error);
  return {
    pagination,
    queue: panelState(queue, 'admin:CharacterVerifyTab'),
    feedback,
    decide: panelState(decide, 'admin:CharacterVerifyTab'),
  };
}
