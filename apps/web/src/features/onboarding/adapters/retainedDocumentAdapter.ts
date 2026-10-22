import { z } from 'zod';
import type {
  RetainedDocumentByIdQuery,
  RetainedDocumentBySlugQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import { documentHref } from '../../../utils/documentHref.js';
import BY_ID from './retainedDocumentById.graphql?raw';
import BY_SLUG from './retainedDocumentBySlug.graphql?raw';

const documentSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  kind: z.string(),
  category: z.string().nullable(),
  title: z.string(),
});
export async function loadRetainedDocument(identity: string) {
  try {
    const uuid = z.string().uuid().safeParse(identity);
    const document = uuid.success
      ? (await graphqlRequest<RetainedDocumentByIdQuery>(BY_ID, { id: uuid.data }))
          .documentById
      : (await graphqlRequest<RetainedDocumentBySlugQuery>(BY_SLUG, { slug: identity }))
          .document;
    if (!document) return null;
    const parsed = documentSchema.parse(document);
    return { ...parsed, href: documentHref(parsed) };
  } catch (error) {
    throw toAppError(
      error instanceof z.ZodError ? { failure: 'InvalidWire' } : error,
      'retained:document',
    );
  }
}
