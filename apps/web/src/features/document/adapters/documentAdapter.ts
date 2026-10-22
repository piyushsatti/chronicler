import type { DocumentQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import DOCUMENT_QUERY from './document.graphql?raw';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import { documentWireSchema } from './document.wire.schema.js';

type DocumentView = {
  id: string;
  slug: string;
  kind: string;
  category: string | null;
  title: string;
  body: string | null;
  authorHandle: string | null;
};

function mapDocument(
  d: ReturnType<typeof documentWireSchema.parse>,
): DocumentView {
  return {
    id: d.id,
    slug: d.slug,
    kind: d.kind,
    category: d.category ?? null,
    title: d.title,
    body: d.effectiveBody ?? null,
    authorHandle: d.author?.handle ?? null,
  };
}

export function parseDocument(wire: unknown): AdapterResult<DocumentView> {
  const parsed = documentWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return { ok: true, data: mapDocument(parsed.data) };
}

export async function loadDocument(slug: string): Promise<DocumentView> {
  try {
    const data = await graphqlRequest<DocumentQuery>(DOCUMENT_QUERY, { slug });
    if (data.document == null) {
      throw toAppError({ failure: 'NotFound' }, 'document:load');
    }
    const result = parseDocument(data.document);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'document:load');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'document:load');
  }
}
