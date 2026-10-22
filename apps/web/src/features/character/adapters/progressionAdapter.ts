import { z } from 'zod';
import type { CharacterProgressionQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import PROGRESSION_QUERY from './characterProgression.graphql?raw';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';

const entrySchema = z.object({
  id: z.string().uuid().optional(),
  amount: z.number().int().nullable().optional(),
  note: z.string().nullable().optional(),
  recordedAt: z.string().optional(),
});

const progressionWireSchema = z.object({
  items: z.array(entrySchema).optional().default([]),
  total: z.number().int().optional(),
});

export type ProgressionEntryView = {
  amount: number;
  note: string | null;
  recordedAt: string | null;
};

export function parseProgression(wire: unknown): AdapterResult<ProgressionEntryView[]> {
  const parsed = progressionWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.items
      .filter((e): e is typeof e & { amount: number } => typeof e.amount === 'number')
      .map((e) => ({
        amount: e.amount,
        note: e.note ?? null,
        recordedAt: e.recordedAt ?? null,
      })),
  };
}

export async function loadCharacterProgression(
  characterId: string,
): Promise<ProgressionEntryView[]> {
  try {
    const data = await graphqlRequest<CharacterProgressionQuery>(PROGRESSION_QUERY, {
      characterId,
      limit: 50,
      offset: 0,
    });
    const result = parseProgression(data.characterProgression);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'character:progression');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'character:progression');
  }
}
