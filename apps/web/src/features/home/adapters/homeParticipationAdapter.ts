import { commandRequest, type CommandAuth } from '../../../api/command.js';
import { z } from 'zod';
import type { HomeWithdrawFromQuestMutation } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import WITHDRAW from './homeWithdraw.graphql?raw';

export type HomeWithdrawal = { questId: string; characterId: string };
const withdrawalReceipt = z.object({
  questId: z.string().uuid(),
  characterId: z.string().uuid(),
  status: z.literal('withdrawn'),
});

export async function withdrawFromHomeQuest(
  input: HomeWithdrawal,
  cmd: CommandAuth,
): Promise<void> {
  const { meta, init } = commandRequest(cmd);
  try {
    const data = await graphqlRequest<HomeWithdrawFromQuestMutation>(
      WITHDRAW,
      {
        ...input,
        meta,
      },
      init,
    );
    const receipt = withdrawalReceipt.parse(data.withdrawFromQuest);
    if (receipt.questId !== input.questId || receipt.characterId !== input.characterId)
      throw toAppError({ failure: 'InvalidWire' }, 'home:withdraw');
  } catch (error) {
    throw toAppError(error, 'home:withdraw');
  }
}
