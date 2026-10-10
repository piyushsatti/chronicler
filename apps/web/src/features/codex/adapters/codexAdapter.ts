import { z } from 'zod';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import { codexDirectoryWireSchema } from './codex.wire.schema.js';

export type CodexEntryView = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
};

export type CodexEntryDetailView = {
  id: string;
  slug: string;
  kind: string;
  category: string | null;
  title: string;
  body: string | null;
  authorHandle: string | null;
  backlinkCount: number;
};

const entryDetailWireSchema = z.object({
  backlinkCount: z.number().int().nonnegative(),
  document: z.object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    kind: z.string().min(1),
    category: z.string().nullable().optional(),
    status: z.string().min(1),
    visibility: z.string().min(1),
    title: z.string().min(1),
    effectiveBody: z.string().nullable().optional(),
    author: z.object({ handle: z.string() }).nullable().optional(),
  }),
});


const DIRECTORY_QUERY = `
  query CodexDirectory($categoryPrefix: String, $search: String) {
    codexDirectory(categoryPrefix: $categoryPrefix, search: $search) {
      items {
        id
        slug
        title
        category
      }
      total
    }
  }
`;

export function parseCodexDirectory(wire: unknown): AdapterResult<CodexEntryView[]> {
  const parsed = codexDirectoryWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  return {
    ok: true,
    data: parsed.data.items.map((item) => ({
      id: item.id,
      slug: item.slug,
      title: item.title,
      category: item.category ?? null,
    })),
  };
}

const ENTRY_QUERY = `
  query CodexEntry($slug: String!) {
    codexEntry(slug: $slug) {
      backlinkCount
      document {
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
  }
`;

export function parseCodexEntryDetail(
  wire: unknown,
): AdapterResult<CodexEntryDetailView> {
  const parsed = entryDetailWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const d = parsed.data.document;
  return {
    ok: true,
    data: {
      id: d.id,
      slug: d.slug,
      kind: d.kind,
      category: d.category ?? null,
      title: d.title,
      body: d.effectiveBody ?? null,
      authorHandle: d.author?.handle ?? null,
      backlinkCount: parsed.data.backlinkCount,
    },
  };
}

export async function loadCodexDirectory(opts: {
  categoryPrefix?: string;
  search?: string;
}): Promise<CodexEntryView[]> {
  try {
    const data = await graphqlRequest<{ codexDirectory: unknown }>(DIRECTORY_QUERY, {
      categoryPrefix: opts.categoryPrefix ?? null,
      search: opts.search ?? null,
    });
    const result = parseCodexDirectory(data.codexDirectory);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'codex:directory');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'codex:directory');
  }
}

export async function loadCodexEntry(
  slug: string,
): Promise<CodexEntryDetailView> {
  try {
    const data = await graphqlRequest<{ codexEntry: unknown | null }>(
      ENTRY_QUERY,
      { slug },
    );
    if (data.codexEntry == null) {
      throw toAppError({ failure: 'NotFound' }, 'codex:entry');
    }
    const result = parseCodexEntryDetail(data.codexEntry);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'codex:entry');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'codex:entry');
  }
}
