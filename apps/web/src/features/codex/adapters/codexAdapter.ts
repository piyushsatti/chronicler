import { z } from 'zod';
import type {
  CodexBacklinkDocumentQuery,
  CodexDirectoryQuery,
  CodexEntryQuery,
  CodexEntryByIdQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import DIRECTORY_QUERY from './codexDirectory.graphql?raw';
import ENTRY_QUERY from './codexEntry.graphql?raw';
import ENTRY_BY_ID_QUERY from './codexEntryById.graphql?raw';
import BACKLINK_DOCUMENT_QUERY from './codexBacklinkDocument.graphql?raw';
import { documentHref } from '../../../utils/documentHref.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';
import {
  codexCategoriesWireSchema,
  codexDirectoryWireSchema,
  codexReferenceWireSchema,
} from './codex.wire.schema.js';

export type CodexEntryView = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  excerpt: string | null;
};

export type CodexCategoryView = z.infer<typeof codexCategoriesWireSchema>[number];

type CodexDirectoryView = {
  items: CodexEntryView[];
  total: number;
  categories: CodexCategoryView[];
};

type CodexEntryDetailView = {
  id: string;
  slug: string;
  kind: string;
  category: string | null;
  title: string;
  body: string | null;
  authorHandle: string | null;
  backlinkCount: number;
  updatedAt: string | null;
  canEdit: boolean;
  backlinks: { documentId: string; relation: string }[];
};

export type CodexBacklinkView = {
  id: string;
  title: string;
  category: string | null;
  kind: string;
  href: string | null;
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
    updatedAt: z.string().nullable().optional(),
    canEditBody: z.boolean().optional(),
    canEditMetadata: z.boolean().optional(),
    author: z.object({ handle: z.string() }).nullable().optional(),
  }),
});

const backlinksWireSchema = z
  .array(z.object({ documentId: z.string().min(1), relation: z.string() }))
  .nullable()
  .optional();

const backlinkDocumentWireSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  kind: z.string().min(1),
  category: z.string().nullable().optional(),
  title: z.string().min(1),
});

export function parseCodexDirectory(
  wire: unknown,
  categoriesWire: unknown,
): AdapterResult<CodexDirectoryView> {
  const parsed = codexDirectoryWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const categories = codexCategoriesWireSchema.safeParse(categoriesWire);
  if (!categories.success) {
    return { ok: false, failure: 'InvalidWire', detail: categories.error.message };
  }
  return {
    ok: true,
    data: {
      items: parsed.data.items.map((item) => ({
        id: item.id,
        slug: item.slug,
        title: item.title,
        category: item.category ?? null,
        excerpt: item.effectiveBody?.replace(/\s+/g, ' ').trim().slice(0, 160) || null,
      })),
      total: parsed.data.total,
      categories: categories.data,
    },
  };
}

export function parseCodexEntryDetail(
  wire: unknown,
  backlinksWire?: unknown,
): AdapterResult<CodexEntryDetailView> {
  const parsed = entryDetailWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  // Backlinks are a sidebar; a malformed list hides it instead of failing the entry.
  const backlinks = backlinksWireSchema.safeParse(backlinksWire);
  const d = parsed.data.document;
  if (d.kind !== 'codex_entry') return { ok: false, failure: 'NotFound' };
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
      updatedAt: d.updatedAt ?? null,
      canEdit: d.canEditBody === true || d.canEditMetadata === true,
      backlinks: backlinks.success ? (backlinks.data ?? []) : [],
    },
  };
}

export function parseCodexCanonicalSlug(wire: unknown): AdapterResult<string> {
  const parsed = codexReferenceWireSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  if (parsed.data.kind !== 'codex_entry') return { ok: false, failure: 'NotFound' };
  return { ok: true, data: parsed.data.slug };
}

export async function loadCodexDirectory(opts: {
  categoryPrefix?: string;
  search?: string;
  limit: number;
  offset: number;
}): Promise<CodexDirectoryView> {
  try {
    const data = await graphqlRequest<CodexDirectoryQuery>(DIRECTORY_QUERY, {
      categoryPrefix: opts.categoryPrefix ?? null,
      search: opts.search ?? null,
      limit: opts.limit,
      offset: opts.offset,
    });
    const result = parseCodexDirectory(data.codexDirectory, data.codexCategories);
    if (!result.ok) {
      throw toAppError({ failure: result.failure }, 'codex:directory');
    }
    return result.data;
  } catch (err) {
    throw toAppError(err, 'codex:directory');
  }
}

export async function loadCodexEntry(slug: string): Promise<CodexEntryDetailView> {
  try {
    const data = await graphqlRequest<CodexEntryQuery>(ENTRY_QUERY, { slug });
    if (data.codexEntry == null) {
      throw toAppError({ failure: 'NotFound' }, 'codex:entry');
    }
    const result = parseCodexEntryDetail(
      data.codexEntry,
      (data as { documentBacklinks?: unknown }).documentBacklinks,
    );
    if (!result.ok) throw toAppError({ failure: result.failure }, 'codex:entry');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'codex:entry');
  }
}

export async function loadCodexEntrySlug(id: string): Promise<string> {
  try {
    if (!z.string().uuid().safeParse(id).success) {
      throw toAppError({ failure: 'NotFound' }, 'codex:entry-alias');
    }
    const data = await graphqlRequest<CodexEntryByIdQuery>(ENTRY_BY_ID_QUERY, { id });
    if (data.documentById == null) {
      throw toAppError({ failure: 'NotFound' }, 'codex:entry-alias');
    }
    const result = parseCodexCanonicalSlug(data.documentById);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'codex:entry-alias');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'codex:entry-alias');
  }
}

/** One linking document, or null when this viewer cannot read it. */
export async function loadCodexBacklinkDocument(
  id: string,
): Promise<CodexBacklinkView | null> {
  try {
    const data = await graphqlRequest<CodexBacklinkDocumentQuery>(
      BACKLINK_DOCUMENT_QUERY,
      { id },
    );
    if (data.documentById == null) return null;
    const parsed = backlinkDocumentWireSchema.safeParse(data.documentById);
    if (!parsed.success) {
      throw toAppError({ failure: 'InvalidWire' }, 'codex:backlink');
    }
    const doc = parsed.data;
    return {
      id: doc.id,
      title: doc.title,
      category: doc.category ?? null,
      kind: doc.kind,
      href: documentHref({ kind: doc.kind, slug: doc.slug, category: doc.category }),
    };
  } catch (err) {
    throw toAppError(err, 'codex:backlink');
  }
}
