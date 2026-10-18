import type {
  RetireCharacterMutation,
  SubmitForVerificationMutation,
  SyncCharacterDdbMutation,
  UpdateCharacterProfileMutation,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import UPDATE_PROFILE from './updateCharacterProfile.graphql?raw';
import SYNC_DDB from './syncCharacterDdb.graphql?raw';
import SUBMIT_VERIFICATION from './submitForVerification.graphql?raw';
import RETIRE from './retireCharacter.graphql?raw';

function commandMeta(): { idempotencyKey: string } {
  return { idempotencyKey: crypto.randomUUID() };
}

/**
 * field-routing: updateCharacterProfile (+ optional syncCharacterDdb for ddbUrl).
 * Schema UpdateCharacterProfileV2Input is description/backgroundText only.
 */
export async function updateCharacterProfile(
  characterId: string,
  input: {
    description?: string | null;
    ddbUrl?: string | null;
  },
): Promise<void> {
  try {
    await graphqlRequest<UpdateCharacterProfileMutation>(UPDATE_PROFILE, {
      characterId,
      input: { description: input.description ?? null },
      meta: commandMeta(),
    });
    const ddbUrl = input.ddbUrl?.trim();
    if (ddbUrl) {
      await graphqlRequest<SyncCharacterDdbMutation>(SYNC_DDB, {
        characterId,
        ddbUrl,
        meta: commandMeta(),
      });
    }
  } catch (err) {
    throw toAppError(err, 'character:profile:update');
  }
}

/** field-routing: submitForVerification */
export async function submitCharacterForVerification(
  characterId: string,
  expectedUpdatedAt: string,
): Promise<void> {
  try {
    await graphqlRequest<SubmitForVerificationMutation>(SUBMIT_VERIFICATION, {
      characterId,
      expectedUpdatedAt,
      meta: commandMeta(),
    });
  } catch (err) {
    throw toAppError(err, 'character:submit-verification');
  }
}

/** field-routing: retireCharacter */
export async function retireCharacter(
  characterId: string,
  expectedUpdatedAt: string,
): Promise<void> {
  try {
    await graphqlRequest<RetireCharacterMutation>(RETIRE, {
      characterId,
      expectedUpdatedAt,
      meta: commandMeta(),
    });
  } catch (err) {
    throw toAppError(err, 'character:retire');
  }
}
