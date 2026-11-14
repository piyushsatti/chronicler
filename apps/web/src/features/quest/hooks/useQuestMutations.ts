import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { queryKeys } from '../../../api/queryKeys.js';
import { useAuth } from '../../../auth/AuthContext.js';
import { toAppError } from '../../../errors/toAppError.js';
import { executeQuestCommand, type QuestCommand } from '../adapters/questCommands.js';

export function useQuestMutations(shortCode: string, questId: string) {
  const client = useQueryClient();
  const { token, isCurrentSession } = useAuth();
  const pending = useRef(false);
  const keys = useRef(new Map<string, string>());
  const mutation = useMutation({
    mutationFn: async ({ command, key }: { command: QuestCommand; key: string }) => {
      if (!isCurrentSession(token))
        throw toAppError({ failure: 'Unauthorized' }, 'quest:session');
      return executeQuestCommand(command, key);
    },
    retry: false,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: shortCode ? queryKeys.quest(shortCode) : ['quest'],
        }),
        client.invalidateQueries({
          queryKey: shortCode ? queryKeys.questSummary(shortCode) : ['questSummary'],
        }),
        client.invalidateQueries({ queryKey: queryKeys.questLists }),
        client.invalidateQueries({ queryKey: queryKeys.homeLanes }),
        client.invalidateQueries({ queryKey: queryKeys.notifications }),
        client.invalidateQueries({ queryKey: queryKeys.notificationsUnread }),
        client.invalidateQueries({ queryKey: ['questOptions'] }),
      ]);
    },
    onError: (error) => {
      const app = toAppError(error, 'quest:command');
      if (app.kind === 'forbidden' || app.kind === 'unauthorized') {
        void client.invalidateQueries({ queryKey: queryKeys.me });
        void client.invalidateQueries({ queryKey: ['questAuthority'] });
      }
    },
  });
  const execute = async (command: QuestCommand): Promise<boolean> => {
    if (pending.current || (questId && command.questId !== questId)) return false;
    pending.current = true;
    const signature = JSON.stringify(command);
    const key = keys.current.get(signature) ?? crypto.randomUUID();
    keys.current.set(signature, key);
    try {
      await mutation.mutateAsync({ command, key });
      keys.current.delete(signature);
      return true;
    } catch {
      return false;
    } finally {
      pending.current = false;
    }
  };
  return {
    execute,
    pending: mutation.isPending,
    error: mutation.error ? toAppError(mutation.error, 'quest:command') : null,
    message: mutation.data ?? null,
  };
}
