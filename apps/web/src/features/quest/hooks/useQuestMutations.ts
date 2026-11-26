import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { queryKeys } from '../../../api/queryKeys.js';
import { toAppError } from '../../../errors/toAppError.js';
import { useFencedMutation } from '../../../hooks/useFencedMutation.js';
import { executeQuestCommand, type QuestCommand } from '../adapters/questCommands.js';

export function useQuestMutations(shortCode: string, questId: string) {
  const client = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const lastResult = useRef<string | null>(null);
  const fence = useFencedMutation({
    context: 'quest:command',
    run: async (command: QuestCommand, cmd) => {
      try {
        const result = await executeQuestCommand(command, cmd);
        lastResult.current = result;
        return result;
      } catch (error) {
        const app = toAppError(error, 'quest:command');
        if (app.kind === 'forbidden' || app.kind === 'unauthorized') {
          void client.invalidateQueries({ queryKey: queryKeys.me });
          void client.invalidateQueries({ queryKey: queryKeys.questAuthorityAll });
        }
        throw error;
      }
    },
    invalidate: async () =>
      Promise.all([
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
        client.invalidateQueries({ queryKey: queryKeys.questOptionsAll }),
      ]),
  });
  const execute = async (command: QuestCommand): Promise<boolean> => {
    if (questId && command.questId !== questId) return false;
    lastResult.current = null;
    const ok = await fence.execute(command);
    if (ok) setMessage(lastResult.current);
    return ok;
  };
  return {
    execute,
    pending: fence.pending,
    error: fence.error,
    message,
  };
}
