import { z } from 'zod';
import type { QuestGenreOptionsQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import GENRE_OPTIONS from './questGenreOptions.graphql?raw';

const optionsSchema = z.array(z.string());

export function parseQuestGenreOptions(wire: unknown): AdapterResult<string[]> {
  const parsed = optionsSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return { ok: true, data: parsed.data };
}

/** field-routing: questGenreOptions → GraphQL Query.questGenreOptions */
export async function loadQuestGenreOptions(): Promise<string[]> {
  try {
    const data = await graphqlRequest<QuestGenreOptionsQuery>(GENRE_OPTIONS);
    const result = parseQuestGenreOptions(data.questGenreOptions);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'editor:genre-options');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'editor:genre-options');
  }
}
