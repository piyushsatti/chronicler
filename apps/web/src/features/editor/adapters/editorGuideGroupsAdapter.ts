import { z } from 'zod';
import type { EditorGuideGroupsQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import { isRulingCategory } from '../../../utils/documentHref.js';
import GUIDE_GROUPS from './editorGuideGroups.graphql?raw';

const pageSchema = z.object({
  items: z.array(z.object({ category: z.string().nullish() })),
  total: z.number().int().nonnegative(),
});
const PAGE = 100;

/** field-routing: documents → GraphQL Query.documents. The groups the published guides
 * already use (the Rules page's headings), offered as suggestions on a guide's Group
 * field. Rulings and the generic "guide" category are not groups. */
export async function loadEditorGuideGroups(): Promise<string[]> {
  try {
    const groups = new Set<string>();
    let seen = 0;
    for (;;) {
      const wire = await graphqlRequest<EditorGuideGroupsQuery>(GUIDE_GROUPS, {
        limit: PAGE,
        offset: seen,
      });
      const page = pageSchema.parse(wire.documents);
      seen += page.items.length;
      for (const { category } of page.items) {
        const name = category?.trim() ?? '';
        if (name && !isRulingCategory(name) && !['guide', 'guides'].includes(name.toLowerCase()))
          groups.add(name);
      }
      if (page.items.length < PAGE || seen >= page.total) break;
    }
    return [...groups].sort((a, b) => a.localeCompare(b));
  } catch (error) {
    throw toAppError(
      error instanceof z.ZodError ? { failure: 'InvalidWire' } : error,
      'editor:guide-groups',
    );
  }
}
