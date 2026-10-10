import { z } from 'zod';
import { graphqlRequest } from '../../../api/graphql.js';
import { restRequest } from '../../../api/rest.js';
import { rest } from '../../../api/endpoints.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';

const docHitSchema = z.object({
  id: z.string(),
  kind: z.string(),
  slug: z.string(),
  title: z.string(),
  snippet: z.string(),
  questShortCode: z.string().nullable().optional(),
});

const memberHitSchema = z.object({
  memberId: z.string(),
  handle: z.string(),
  displayName: z.string(),
});

const searchWireSchema = z.object({
  query: z.string(),
  documents: z.array(docHitSchema),
  members: z.array(memberHitSchema),
});

const kindsWireSchema = z.union([
  z.array(z.string()),
  z.object({ kinds: z.array(z.string()) }),
]);

export type SearchHitView = {
  id: string;
  kind: string;
  title: string;
  slug: string | null;
  snippet: string | null;
};

export function parseSearch(wire: unknown): AdapterResult<SearchHitView[]> {
  const parsed = searchWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const docs = parsed.data.documents.map((h) => ({
    id: h.id,
    kind: h.kind,
    title: h.title,
    slug: h.slug,
    snippet: h.snippet,
  }));
  const members = parsed.data.members.map((h) => ({
    id: h.memberId,
    kind: 'member',
    title: h.displayName,
    slug: h.handle,
    snippet: `@${h.handle}`,
  }));
  return { ok: true, data: [...docs, ...members] };
}

export function parseSearchKinds(wire: unknown): AdapterResult<string[]> {
  const parsed = kindsWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: Array.isArray(parsed.data) ? parsed.data : parsed.data.kinds,
  };
}

const SEARCH_QUERY = `
  query Search($query: String!, $kinds: [String!], $limit: Int!) {
    search(query: $query, kinds: $kinds, limit: $limit) {
      query
      documents {
        id
        kind
        slug
        title
        snippet
        questShortCode
      }
      members {
        memberId
        handle
        displayName
      }
    }
  }
`;

export async function loadSearchKinds(): Promise<string[]> {
  try {
    const wire = await restRequest<unknown>(rest.searchKinds);
    const result = parseSearchKinds(wire);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'search:kinds');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'search:kinds');
  }
}

export async function loadSearch(
  query: string,
  kinds?: string[],
): Promise<SearchHitView[]> {
  try {
    const data = await graphqlRequest<{ search: unknown }>(SEARCH_QUERY, {
      query,
      kinds: kinds?.length ? kinds : null,
      limit: 20,
    });
    const result = parseSearch(data.search);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'search:load');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'search:load');
  }
}
