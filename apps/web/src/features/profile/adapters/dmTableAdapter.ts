import { z } from 'zod';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import type { AdapterResult } from '../../../errors/types.js';

export type DmTableView = {
  id: string;
  slug: string;
  title: string;
  blurb: string | null;
  tags: string[];
  body: string | null;
  status: string;
  authorHandle: string | null;
  isPublished: boolean;
};

export type DmTableSessionView = {
  id: string;
  shortCode: string;
  title: string;
  scheduledAt: string;
  status: string;
  slotsMax: number;
  filledCount: number;
};

const dmTableDocSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  status: z.string(),
  effectiveBody: z.string().nullable().optional(),
  frontmatter: z
    .object({
      blurb: z.string().optional(),
      tags: z.array(z.string()).optional(),
    })
    .passthrough()
    .nullable()
    .optional(),
  author: z
    .object({
      handle: z.string(),
    })
    .nullable()
    .optional(),
});

const DM_TABLE_QUERY = `
  query DmTableBySlug($slug: String!) {
    document(slug: $slug) {
      id
      slug
      title
      status
      kind
      category
      effectiveBody
      frontmatter
      author { handle }
    }
  }
`;

const SCHEDULE_QUERY = `
  query DmTableSchedule($limit: Int!) {
    questBoard(limit: $limit) {
      items {
        id
        shortCode
        status
        scheduledAt
        slotsMax
        filledCount
        displayStatus
        dm { handle displayName }
        briefDocument { title }
      }
    }
  }
`;

const scheduleItemSchema = z.object({
  id: z.string(),
  shortCode: z.string(),
  status: z.string(),
  scheduledAt: z.string(),
  slotsMax: z.number(),
  filledCount: z.number(),
  displayStatus: z.string().nullable().optional(),
  dm: z
    .object({
      handle: z.string(),
      displayName: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  briefDocument: z
    .object({
      title: z.string(),
    })
    .nullable()
    .optional(),
});

export function parseDmTableDocument(wire: unknown): AdapterResult<DmTableView | null> {
  if (wire == null) return { ok: true, data: null };
  const parsed = dmTableDocSchema.safeParse(wire);
  if (!parsed.success) {
    return { ok: false, failure: 'InvalidWire', detail: parsed.error.message };
  }
  const d = parsed.data;
  const fm = d.frontmatter ?? {};
  return {
    ok: true,
    data: {
      id: d.id,
      slug: d.slug,
      title: d.title,
      blurb: fm.blurb ?? null,
      tags: fm.tags ?? [],
      body: d.effectiveBody ?? null,
      status: d.status,
      authorHandle: d.author?.handle ?? null,
      isPublished: d.status === 'published',
    },
  };
}

/** Load a community/dm_table document by slug when the document resolver returns it. */
export async function loadDmTableBySlug(slug: string): Promise<DmTableView | null> {
  if (!slug) return null;
  try {
    const data = await graphqlRequest<{ document: unknown | null }>(DM_TABLE_QUERY, {
      slug,
    });
    const result = parseDmTableDocument(data.document);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'profile:dm-table');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'profile:dm-table');
  }
}

/**
 * Upcoming sessions for a DM handle — filtered from the public quest board.
 * No dedicated dm-table schedule query exists; board filter is the contract-safe path.
 */
export async function loadDmTableSchedule(handle: string): Promise<DmTableSessionView[]> {
  const needle = handle.replace(/^@/, '').toLowerCase();
  if (!needle) return [];
  try {
    const data = await graphqlRequest<{
      questBoard: { items: unknown[] };
    }>(SCHEDULE_QUERY, { limit: 50 });
    const items = z.array(scheduleItemSchema).safeParse(data.questBoard?.items ?? []);
    if (!items.success) {
      throw toAppError({ failure: 'InvalidWire' }, 'profile:dm-table:schedule');
    }
    const now = Date.now();
    return items.data
      .filter((q) => (q.dm?.handle ?? '').toLowerCase() === needle)
      .filter((q) => {
        const t = Date.parse(q.scheduledAt);
        return Number.isFinite(t) ? t >= now - 86400000 : true;
      })
      .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
      .map((q) => ({
        id: q.id,
        shortCode: q.shortCode,
        title: q.briefDocument?.title ?? q.shortCode,
        scheduledAt: q.scheduledAt,
        status: q.displayStatus ?? q.status,
        slotsMax: q.slotsMax,
        filledCount: q.filledCount,
      }));
  } catch (err) {
    throw toAppError(err, 'profile:dm-table:schedule');
  }
}
