import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { queryKeys } from '../../../api/queryKeys.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { useToast } from '../../../hooks/useToast.js';
import { toAppError } from '../../../errors/toAppError.js';
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

type Attempt = { input: HomeWithdrawal; key: string; token: string | null };

export function useHomePresentation(quests: HomeQuestView[]) {
  const { timeZone } = useDateFormatter();
  const { isAuthenticated, sessionReady, token, isCurrentSession } = useAuth();
  const me = useMe();
  const stats = useSiteStats();
  const { addToast } = useToast();
  const client = useQueryClient();
  const busy = useRef(false);
  const keys = useRef<{ token: string | null; payloads: Map<string, string> }>({
    token,
    payloads: new Map(),
  });
  const withdrawal = useMutation({
    mutationFn: async (attempt: Attempt) => {
      if (!sessionReady || !isCurrentSession(attempt.token))
        throw toAppError({ failure: 'Unauthorized' }, 'home:session');
      await withdrawFromHomeQuest(attempt.input, attempt.key);
    },
    retry: false,
    onSuccess: async (_result, attempt) => {
      if (!isCurrentSession(attempt.token)) return;
      keys.current.payloads.delete(JSON.stringify(attempt.input));
      addToast('Your character has withdrawn.', 'success');
      await Promise.all(
        [
          queryKeys.homeLanes,
          queryKeys.questLists,
          ['quest'],
          ['questSummary'],
          ['questOptions'],
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
    if (keys.current.token !== token) keys.current = { token, payloads: new Map() };
    const signature = JSON.stringify(input);
    const key = keys.current.payloads.get(signature) ?? crypto.randomUUID();
    keys.current.payloads.set(signature, key);
    try {
      await withdrawal.mutateAsync({ input, key, token });
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
