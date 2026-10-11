import { restRequest } from '../../../api/rest.js';
import { rest } from '../../../api/endpoints.js';
import { toAppError } from '../../../errors/toAppError.js';

/** field-routing: updateCharacterProfileV2 → PATCH /v1/characters/{id}/profile */
export async function updateCharacterProfile(
  characterId: string,
  input: {
    description?: string | null;
    ddbUrl?: string | null;
    displayIcon?: string | null;
  },
): Promise<void> {
  try {
    await restRequest(rest.characterProfile(characterId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  } catch (err) {
    throw toAppError(err, 'character:profile:update');
  }
}

/** field-routing: submitForVerification → POST /v1/characters/{id}/submit-verification */
export async function submitCharacterForVerification(
  characterId: string,
): Promise<void> {
  try {
    await restRequest(rest.characterSubmitVerification(characterId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
    });
  } catch (err) {
    throw toAppError(err, 'character:submit-verification');
  }
}

/** field-routing: retireCharacter → POST /v1/characters/{id}/retire */
export async function retireCharacter(characterId: string): Promise<void> {
  try {
    await restRequest(rest.characterRetire(characterId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
    });
  } catch (err) {
    throw toAppError(err, 'character:retire');
  }
}
