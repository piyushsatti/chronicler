import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import {
  chronicleDocumentWireSchema,
  chronicleListWireSchema,
} from './chronicle.wire.schema.js';

export type ChronicleListItemView = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  authorHandle: string | null;
  excerpt: string | null;
};

export type ChronicleDetailView = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  body: string | null;
  authorHandle: string | null;
};

const LIST_QUERY = `
  query ChronicleList($limit: Int!) {
    documents(filters: { kind: "summary", status: "published" }, limit: $limit) {
      items {
        id
        slug
        kind
        category
        title
        effectiveBody
        author { handle }
      }
      total
    }
  }
`;

const DETAIL_QUERY = `
  query ChronicleDetail($slug: String!) {
    document(slug: $slug) {
      id
      slug
      kind
      category
      status
      visibility
      title
      effectiveBody
      author { handle }
    }
  }
`;

function mapListItem(
  item: (typeof chronicleListWireSchema)['_output']['items'][number],
): ChronicleListItemView {
  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    category: item.category ?? null,
    authorHandle: item.author?.handle ?? null,
    excerpt: item.effectiveBody ?? null,
  };
}

export function parseChronicleList(wire: unknown): AdapterResult<ChronicleListItemView[]> {
  const parsed = chronicleListWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return { ok: true, data: parsed.data.items.map(mapListItem) };
}

export function parseChronicleDetail(wire: unknown): AdapterResult<ChronicleDetailView> {
  const parsed = chronicleDocumentWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: {
      id: parsed.data.id,
      slug: parsed.data.slug,
      title: parsed.data.title,
      category: parsed.data.category ?? null,
      body: parsed.data.effectiveBody ?? null,
      authorHandle: parsed.data.author?.handle ?? null,
    },
  };
}

export async function loadChronicleList(): Promise<ChronicleListItemView[]> {
  try {
    const data = await graphqlRequest<{ documents: unknown }>(LIST_QUERY, {
      limit: 50,
    });
    const result = parseChronicleList(data.documents);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'chronicle:list');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'chronicle:list');
  }
}

export async function loadChronicleDetail(slug: string): Promise<ChronicleDetailView> {
  try {
    const data = await graphqlRequest<{ document: unknown | null }>(DETAIL_QUERY, {
      slug,
    });
    if (data.document == null) {
      throw toAppError({ failure: 'NotFound' }, 'chronicle:detail');
    }
    const result = parseChronicleDetail(data.document);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'chronicle:detail');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'chronicle:detail');
  }
}
