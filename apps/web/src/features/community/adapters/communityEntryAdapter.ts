import { z } from 'zod';
import type { CommunityEntryQuery, CommunityEntryRelatedQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import QUERY from './communityEntry.graphql?raw';
import RELATED_QUERY from './communityEntryRelated.graphql?raw';

const schema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  kind: z.literal('community'),
  category: z.string().nullable(),
  title: z.string().min(1),
  authorId: z.string().uuid(),
  effectiveBody: z.string().nullable(),
  author: z.object({ handle: z.string() }).nullable(),
  publishedAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});

const relatedSchema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    title: z.string().min(1),
    kind: z.literal('community'),
    category: z.string().nullable(),
  })),
});

export async function loadCommunityEntryRelated(authorId: string) {
  const data = await graphqlRequest<CommunityEntryRelatedQuery>(RELATED_QUERY, { authorId });
  const parsed = relatedSchema.safeParse(data.documents);
  if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'community:related');
  return parsed.data.items;
}

export async function loadCommunityEntry(slug: string) {
  const data = await graphqlRequest<CommunityEntryQuery>(QUERY, { slug });
  if (!data.document) throw toAppError({ failure: 'NotFound' }, 'community:entry');
  const parsed = schema.safeParse(data.document);
  if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'community:entry');
  return parsed.data;
}
