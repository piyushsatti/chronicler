import { z } from 'zod';
import type { CommunityHallOfFameQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import QUERY from './communityHallOfFame.graphql?raw';

/** The Hall of Fame is one community Document with this address and category. */
export const HALL_OF_FAME_SLUG = 'hall-of-fame';
export const HALL_OF_FAME_CATEGORY = 'hall_of_fame';

const schema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  kind: z.string(),
  category: z.string().nullable(),
  title: z.string(),
  effectiveBody: z.string().nullable(),
  canEditBody: z.boolean().nullable().optional(),
  canEditMetadata: z.boolean().nullable().optional(),
});

export type HallOfFameView = {
  id: string;
  title: string;
  body: string;
  canEdit: boolean;
};

/** The page, or null when nobody has written it yet. A document that merely
 * shares the address but is another kind is treated as not written. */
export async function loadHallOfFame(): Promise<HallOfFameView | null> {
  let data: CommunityHallOfFameQuery;
  try {
    data = await graphqlRequest<CommunityHallOfFameQuery>(QUERY, {
      slug: HALL_OF_FAME_SLUG,
    });
  } catch (error) {
    throw toAppError(error, 'community:hall-of-fame');
  }
  if (data.document == null) return null;
  const parsed = schema.safeParse(data.document);
  if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'community:hall-of-fame');
  const doc = parsed.data;
  if (doc.kind !== 'community' || doc.category !== HALL_OF_FAME_CATEGORY) return null;
  return {
    id: doc.id,
    title: doc.title,
    body: doc.effectiveBody ?? '',
    canEdit: doc.canEditBody === true || doc.canEditMetadata === true,
  };
}
