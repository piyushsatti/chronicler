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
  decideDmProfileVerification,
  loadDmVerifyQueue,
} from '../adapters/adminAdapter.js';

export function useDmProfileVerifyTab() {
  const authority = useAdminAuthority('review');
  const queryClient = useQueryClient();
  const { query: queue, pagination } = useAdminPage(
    queryKeys.pendingDmProfiles,
    authority,
    {},
    (page, request) => loadDmVerifyQueue(page, request),
  );
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackIsError, setFeedbackIsError] = useState(false);

  const decide = useMutation<
    void,
    unknown,
    Parameters<typeof decideDmProfileVerification>[0]
  >({
    mutationKey: ['adminCommand', authority.commandKey, 'useDmProfileVerifyTab'],
    networkMode: 'always',
    retry: false,
    mutationFn: authority.guardMutation(
      (command, input: Parameters<typeof decideDmProfileVerification>[0]) =>
        decideDmProfileVerification(input, command),
    ),
    onSuccess: async (_data, vars) => {
      if (!authority.isCurrent()) return;
      setFeedbackIsError(false);
      setFeedback(vars.approve ? 'DM profile approved.' : 'Change request recorded.');
      await queryClient.invalidateQueries({ queryKey: queryKeys.pendingDmProfiles });
    },
    onError: (error) => {
      if (!authority.isCurrent()) return;
      setFeedbackIsError(true);
      setFeedback(toAppError(error, 'review:dm-decision').userMessage);
    },
  });
  useAuthorityFailures(queue.error, decide.error);
  return {
    pagination,
    queue: panelState(queue, 'admin:DmProfileVerifyTab'),
    noteById,
    setNoteById,
    feedback,
    feedbackIsError,
    decide: panelState(decide, 'admin:DmProfileVerifyTab'),
  };
}
