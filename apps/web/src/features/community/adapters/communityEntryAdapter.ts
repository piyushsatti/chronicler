import { z } from 'zod';
import type { CommunityEntryQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import QUERY from './communityEntry.graphql?raw';

const schema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  kind: z.literal('community'),
  category: z.string().nullable(),
  title: z.string().min(1),
  effectiveBody: z.string().nullable(),
  author: z.object({ handle: z.string() }).nullable(),
  publishedAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});

export async function loadCommunityEntry(slug: string) {
  const data = await graphqlRequest<CommunityEntryQuery>(QUERY, { slug });
  if (!data.document) throw toAppError({ failure: 'NotFound' }, 'community:entry');
  const parsed = schema.safeParse(data.document);
  if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'community:entry');
  return parsed.data;
}
