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
  decideDmProfileVerification,
  loadDmVerifyQueue,
} from '../adapters/adminAdapter.js';

export function useDmProfileVerifyTab() {
  const authority = useAdminAuthority('review');
  const queryClient = useQueryClient();
  const queue = useQuery({
    enabled: authority.allowed,
    queryKey: queryKeys.pendingDmProfiles,
    queryFn: loadDmVerifyQueue,
  });
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackIsError, setFeedbackIsError] = useState(false);

  const decide = useMutation({
    mutationFn: authority.guardMutation(decideDmProfileVerification),
    onSuccess: async (_data, vars) => {
      setFeedbackIsError(false);
      setFeedback(vars.approve ? 'DM profile approved.' : 'Change request recorded.');
      await queryClient.invalidateQueries({ queryKey: queryKeys.pendingDmProfiles });
    },
    onError: (error) => {
      setFeedbackIsError(true);
      setFeedback(toAppError(error, 'review:dm-decision').userMessage);
    },
  });
  useAuthorityFailures(queue.error, decide.error);
  return {
    queue: panelState(queue, 'admin:DmProfileVerifyTab'),
    noteById,
    setNoteById,
    feedback,
    feedbackIsError,
    decide: panelState(decide, 'admin:DmProfileVerifyTab'),
  };
}
