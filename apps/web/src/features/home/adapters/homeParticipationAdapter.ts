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
  idempotencyKey: string,
): Promise<void> {
  try {
    const data = await graphqlRequest<HomeWithdrawFromQuestMutation>(WITHDRAW, {
      ...input,
      meta: { idempotencyKey },
    });
    const receipt = withdrawalReceipt.parse(data.withdrawFromQuest);
    if (receipt.questId !== input.questId || receipt.characterId !== input.characterId)
      throw toAppError({ failure: 'InvalidWire' }, 'home:withdraw');
  } catch (error) {
    throw toAppError(error, 'home:withdraw');
  }
}
