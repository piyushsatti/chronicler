import { z } from 'zod';
import type {
  SearchQuery,
  SearchableKindsQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import { markdownToPlainText } from '../../../utils/markdownText.js';
import type { AdapterResult } from '../../../errors/types.js';
import SEARCH_QUERY from './search.graphql?raw';
import SEARCHABLE_KINDS_QUERY from './searchableKinds.graphql?raw';

const docHitSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['codex_entry', 'rule', 'summary', 'quest_brief', 'community']),
  category: z.string().nullable(),
  slug: z.string().min(1),
  title: z.string(),
  snippet: z.string(),
  questShortCode: z.string().nullable(),
});
const memberHitSchema = z.object({
  memberId: z.string().min(1),
  handle: z.string().min(1),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
const searchWireSchema = z
  .object({
    query: z.string(),
    documents: z.array(docHitSchema),
    documentTotal: z.number().int().nonnegative(),
    documentOrder: z.literal('rank_desc_updated_at_desc_id_desc'),
    members: z.array(memberHitSchema),
    memberTotal: z.number().int().nonnegative(),
    memberOrder: z.literal('handle_asc_id_asc'),
  })
  .refine(
    (value) =>
      value.documentTotal >= value.documents.length &&
      value.memberTotal >= value.members.length,
  );
const kindsWireSchema = z.array(
  z.object({
    key: z.enum([
      'codex_entry',
      'rule',
      'summary',
      'quest_brief',
      'community',
      'member',
    ]),
    label: z.string().min(1),
    searchable: z.boolean(),
    exclusionReason: z.string().nullable(),
  }),
);

type SearchResultView = z.infer<typeof searchWireSchema>;
export type SearchHitView =
  z.infer<typeof docHitSchema> | z.infer<typeof memberHitSchema>;
type SearchKindView = z.infer<typeof kindsWireSchema>[number];

/** The API sends the first 240 codepoints of the body (behavior.md). */
export const SERVER_SNIPPET_CODEPOINTS = 240;

/** A server snippet as plain text. A snippet at the server's limit was cut, maybe
 * mid-word: drop the partial last word and end it with an ellipsis. */
export function snippetText(raw: string): string {
  const text = markdownToPlainText(raw);
  if ([...raw].length < SERVER_SNIPPET_CODEPOINTS || !text) return text;
  const lastSpace = text.lastIndexOf(' ');
  const kept = lastSpace > text.length / 2 ? text.slice(0, lastSpace) : text;
  return `${kept.replace(/[\s,;:.\-–—]+$/, '')}…`;
}

export function parseSearch(wire: unknown): AdapterResult<SearchResultView> {
  const parsed = searchWireSchema.safeParse(wire);
  if (!parsed.success)
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  // The server cuts snippets from the raw Markdown body; show them as plain text.
  return {
    ok: true,
    data: {
      ...parsed.data,
      documents: parsed.data.documents.map((hit) => ({
        ...hit,
        snippet: snippetText(hit.snippet),
      })),
    },
  };
}
export function parseSearchKinds(wire: unknown): AdapterResult<SearchKindView[]> {
  const parsed = kindsWireSchema.safeParse(wire);
  return parsed.success
    ? { ok: true, data: parsed.data.filter((kind) => kind.searchable) }
    : { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
}
export async function loadSearchKinds(): Promise<SearchKindView[]> {
  try {
    const data = await graphqlRequest<SearchableKindsQuery>(SEARCHABLE_KINDS_QUERY);
    const result = parseSearchKinds(data.searchableKinds);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'search:kinds');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'search:kinds');
  }
}
export async function loadSearch(
  query: string,
  kinds: string[] | null = null,
  limit = 20,
  offset = 0,
): Promise<SearchResultView> {
  try {
    const data = await graphqlRequest<SearchQuery>(SEARCH_QUERY, {
      query,
      kinds,
      limit,
      offset,
    });
    const result = parseSearch(data.search);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'search:load');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'search:load');
  }
}
