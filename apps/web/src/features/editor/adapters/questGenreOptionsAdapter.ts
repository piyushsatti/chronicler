import { z } from 'zod';
import { restRequest } from '../../../api/rest.js';
import { rest } from '../../../api/endpoints.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';

const optionsSchema = z.union([
  z.array(z.string()),
  z.object({ options: z.array(z.string()) }),
  z.object({ genres: z.array(z.string()) }),
]);

export function parseQuestGenreOptions(wire: unknown): AdapterResult<string[]> {
  const parsed = optionsSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  if (Array.isArray(parsed.data)) return { ok: true, data: parsed.data };
  if ('options' in parsed.data) return { ok: true, data: parsed.data.options };
  return { ok: true, data: parsed.data.genres };
}

/** field-routing: questGenreOptions → GET /v1/quests/genre-options */
export async function loadQuestGenreOptions(): Promise<string[]> {
  try {
    const wire = await restRequest<unknown>(rest.questGenreOptions);
    const result = parseQuestGenreOptions(wire);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:genre-options');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'editor:genre-options');
  }
}
