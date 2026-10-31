import { z } from 'zod';
import type { EditorSeriesOptionsQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import SERIES_OPTIONS from './editorSeriesOptions.graphql?raw';

const seriesSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdBy: z.string().uuid(),
});
const pageSchema = z.object({
  items: z.array(seriesSchema),
  total: z.number().int().nonnegative(),
});
export type EditorSeriesOption = { id: string; name: string };

/** field-routing: questArcs → GraphQL Query.questArcs. The series a new quest may
 * join, for its optional Series field: the ones `memberId` created, and with
 * `includeOthers` (an admin) every other series too, labelled as someone else's. The
 * API applies the same rule when the quest is saved. */
export async function loadEditorSeriesOptions(
  memberId: string,
  includeOthers = false,
): Promise<EditorSeriesOption[]> {
  try {
    const items: z.infer<typeof seriesSchema>[] = [];
    for (;;) {
      const wire = await graphqlRequest<EditorSeriesOptionsQuery>(SERIES_OPTIONS, {
        offset: items.length,
      });
      const page = pageSchema.parse(wire.questArcs);
      items.push(...page.items);
      if (items.length >= page.total) break;
      if (page.items.length === 0)
        throw toAppError({ failure: 'InvalidWire' }, 'editor:series-options');
    }
    const own = items.filter((series) => series.createdBy === memberId);
    const others = includeOthers
      ? items.filter((series) => series.createdBy !== memberId)
      : [];
    return [
      ...own.map(({ id, name }) => ({ id, name })),
      ...others.map(({ id, name }) => ({ id, name: `${name} (another DM’s series)` })),
    ];
  } catch (error) {
    throw toAppError(
      error instanceof z.ZodError ? { failure: 'InvalidWire' } : error,
      'editor:series-options',
    );
  }
}
