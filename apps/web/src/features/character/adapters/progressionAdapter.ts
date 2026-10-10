import { z } from 'zod';
import { restRequest } from '../../../api/rest.js';
import { rest } from '../../../api/endpoints.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';

const entrySchema = z.object({
  id: z.string().uuid().optional(),
  amount: z.number().int(),
  note: z.string().nullable().optional(),
  occurredAt: z.string().optional(),
});

const progressionWireSchema = z.object({
  entries: z.array(entrySchema).optional().default([]),
  total: z.number().int().optional(),
});

export type ProgressionEntryView = {
  amount: number;
  note: string | null;
};

export function parseProgression(
  wire: unknown,
): AdapterResult<ProgressionEntryView[]> {
  const parsed = progressionWireSchema.safeParse(wire);
  if (!parsed.success) {
    // Accept bare arrays from incomplete OpenAPI.
    if (Array.isArray(wire)) {
      const items = z.array(entrySchema).safeParse(wire);
      if (!items.success) {
        return { ok: false, failure: 'InvalidWire', detail: items.error.message };
      }
      return {
        ok: true,
        data: items.data.map((e) => ({
          amount: e.amount,
          note: e.note ?? null,
        })),
      };
    }
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.entries.map((e) => ({
      amount: e.amount,
      note: e.note ?? null,
    })),
  };
}

export async function loadCharacterProgression(
  characterId: string,
): Promise<ProgressionEntryView[]> {
  try {
    const wire = await restRequest<unknown>(
      rest.characterProgression(characterId),
    );
    const result = parseProgression(wire);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'character:progression');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'character:progression');
  }
}
