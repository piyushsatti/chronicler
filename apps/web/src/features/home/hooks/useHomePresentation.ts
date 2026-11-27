import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { queryKeys } from '../../../api/queryKeys.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { useToast } from '../../../hooks/useToast.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useCommandFence } from '../../../hooks/useFencedMutation.js';
import { useMe } from '../../../hooks/useMe.js';
import { useDateFormatter } from '../../../hooks/useDateFormatter.js';
import {
  mapToQuestCardProps,
  type HomeQuestView,
} from '../adapters/homeLanesAdapter.js';
import {
  withdrawFromHomeQuest,
  type HomeWithdrawal,
} from '../adapters/homeParticipationAdapter.js';
import { useSiteStats } from './useSiteStats.js';

type Attempt = { input: HomeWithdrawal; token: string | null };

export function useHomePresentation(quests: HomeQuestView[]) {
  const { timeZone } = useDateFormatter();
  const { isAuthenticated, sessionReady, token, isCurrentSession } = useAuth();
  const me = useMe();
  const stats = useSiteStats();
  const { addToast } = useToast();
  const client = useQueryClient();
  const busy = useRef(false);
  const fence = useCommandFence('home:session');
  const withdrawal = useMutation({
    mutationFn: async (attempt: Attempt) => {
      if (!sessionReady || !isCurrentSession(attempt.token))
        throw toAppError({ failure: 'Unauthorized' }, 'home:session');
      // A retry of the same withdrawal reuses its idempotency key.
      await fence.runExclusive((cmd) =>
        withdrawFromHomeQuest(attempt.input, {
          token: cmd.token,
          idempotencyKey: cmd.keyFor(JSON.stringify(attempt.input)),
          signal: cmd.signal,
        }),
      );
    },
    retry: false,
    onSuccess: async (_result, attempt) => {
      if (!isCurrentSession(attempt.token)) return;
      addToast('Your character has withdrawn.', 'success');
      await Promise.all(
        [
          queryKeys.homeLanes,
          queryKeys.questLists,
          queryKeys.questAll,
          queryKeys.questSummaryAll,
          queryKeys.questOptionsAll,
          queryKeys.notifications,
          queryKeys.notificationsUnread,
        ].map((queryKey) => client.invalidateQueries({ queryKey })),
      );
    },
    onError: (error, attempt) => {
      if (!isCurrentSession(attempt.token)) return;
      const appError = toAppError(error, 'home:withdraw');
      addToast(appError.userMessage, 'error');
      if (appError.kind === 'forbidden' || appError.kind === 'unauthorized')
        void client.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
  const memberId = me.data?.id;
  async function withdraw(input: HomeWithdrawal) {
    if (busy.current || !memberId || !sessionReady || !isCurrentSession(token)) return;
    busy.current = true;
    try {
      await withdrawal.mutateAsync({ input, token });
    } catch {
      /* The mutation reports a session-scoped error and retains the replay key. */
    } finally {
      busy.current = false;
    }
  }
  const cards = quests.map((quest, animIndex) =>
    mapToQuestCardProps(quest, {
      timeZone,
      animIndex,
      memberId,
      isMutating: withdrawal.isPending,
      onWithdrawConfirm: (characterId) => {
        void withdraw({ questId: quest.id, characterId });
      },
    }),
  );
  return {
    cards,
    stats: stats.data,
    isAuthenticated,
    displayName: isAuthenticated
      ? (me.data?.displayName ?? me.data?.handle ?? null)
      : null,
    showNewHere: !isAuthenticated,
  };
}
