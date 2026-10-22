import type {
  RetireCharacterMutation,
  SubmitForVerificationMutation,
  SyncCharacterDdbMutation,
  UpdateCharacterProfileMutation,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { safeAppError, toAppError } from '../../../errors/toAppError.js';
import { TransportError } from '../../../errors/types.js';
import { z } from 'zod';
import UPDATE_PROFILE from './updateCharacterProfile.graphql?raw';
import SYNC_DDB from './syncCharacterDdb.graphql?raw';
import SUBMIT_VERIFICATION from './submitForVerification.graphql?raw';
import RETIRE from './retireCharacter.graphql?raw';

export async function updateCharacterProfile(
  characterId: string,
  input: { description?: string | null; imageUrl?: string | null },
  idempotencyKey: string,
): Promise<void> {
  try {
    await graphqlRequest<UpdateCharacterProfileMutation>(UPDATE_PROFILE, {
      characterId,
      input,
      meta: { idempotencyKey },
    });
  } catch (err) {
    throw toAppError(err, 'character:profile:update');
  }
}

export async function syncCharacterDdb(
  characterId: string,
  ddbUrl: string,
  idempotencyKey: string,
) {
  try {
    const data = await graphqlRequest<SyncCharacterDdbMutation>(SYNC_DDB, {
      characterId,
      ddbUrl,
      meta: { idempotencyKey },
    });
    return z
      .object({
        succeeded: z.boolean(),
        safeError: z.string().nullable(),
        attemptedAt: z.string(),
      })
      .parse(data.syncCharacterDdb);
  } catch (err) {
    if (err instanceof TransportError && err.code === 'INVALID') {
      throw safeAppError(
        'Enter a D&D Beyond character URL, such as https://www.dndbeyond.com/characters/123.',
        'character:ddb:sync',
      );
    }
    throw toAppError(err, 'character:ddb:sync');
  }
}

/** field-routing: submitForVerification */
export async function submitCharacterForVerification(
  characterId: string,
  expectedUpdatedAt: string,
  idempotencyKey: string,
): Promise<void> {
  try {
    await graphqlRequest<SubmitForVerificationMutation>(SUBMIT_VERIFICATION, {
      characterId,
      expectedUpdatedAt,
      meta: { idempotencyKey },
    });
  } catch (err) {
    if (err instanceof TransportError && err.code === 'CONFLICT') {
      throw safeAppError(
        'This character changed. Reload and try again.',
        'character:submit-verification',
      );
    }
    throw toAppError(err, 'character:submit-verification');
  }
}

/** field-routing: retireCharacter */
export async function retireCharacter(
  characterId: string,
  expectedUpdatedAt: string,
  idempotencyKey: string,
): Promise<void> {
  try {
    await graphqlRequest<RetireCharacterMutation>(RETIRE, {
      characterId,
      expectedUpdatedAt,
      meta: { idempotencyKey },
    });
  } catch (err) {
    if (err instanceof TransportError && err.code === 'CONFLICT') {
      throw safeAppError(
        'This character changed. Reload and try again.',
        'character:retire',
      );
    }
    throw toAppError(err, 'character:retire');
  }
}
