import {
  useAdminAuthority,
  useAuthorityFailures,
  panelState,
} from './useAdminAuthority.js';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import {
  decideCharacterVerification,
  loadCharVerifyQueue,
} from '../adapters/adminAdapter.js';

export function useCharacterVerifyTab() {
  const authority = useAdminAuthority('review');
  const queryClient = useQueryClient();
  const queue = useQuery({
    enabled: authority.allowed,
    queryKey: queryKeys.pendingCharacters,
    queryFn: loadCharVerifyQueue,
  });
  const [changeRequestId, setChangeRequestId] = useState<string | null>(null);
  const [changeRequestNote, setChangeRequestNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const decide = useMutation({
    mutationFn: authority.guardMutation(decideCharacterVerification),
    onSuccess: async (_data, vars) => {
      setFeedback({
        type: 'success',
        message: vars.approve
          ? 'Character approved.'
          : 'Change request recorded and returned to the owner.',
      });
      setChangeRequestId(null);
      setChangeRequestNote('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.pendingCharacters });
    },
    onError: (error, vars) => {
      const appError = toAppError(error, 'review:character-decision');
      const message = error instanceof Error ? error.message : String(error ?? '');
      const isStale = /changed since|stale|refresh the verification queue/i.test(
        message,
      );
      setFeedback({
        type: 'error',
        message:
          appError.kind === 'forbidden' || appError.kind === 'unauthorized'
            ? appError.userMessage
            : isStale
              ? 'This character changed while you were reviewing it. Refresh the queue and try again.'
              : vars.approve
                ? 'Could not approve this character. Please try again.'
                : 'Could not request changes for this character. Please try again.',
      });
    },
  });
  useAuthorityFailures(queue.error, decide.error);
  return {
    queue: panelState(queue, 'admin:CharacterVerifyTab'),
    changeRequestId,
    setChangeRequestId,
    changeRequestNote,
    setChangeRequestNote,
    noteError,
    setNoteError,
    feedback,
    decide: panelState(decide, 'admin:CharacterVerifyTab'),
  };
}
