import { z } from 'zod';
import type {
  DmTableBySlugQuery,
  DmTableScheduleQuery,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import DM_TABLE_QUERY from './dmTableBySlug.graphql?raw';
import SCHEDULE_QUERY from './dmTableSchedule.graphql?raw';
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
  authorId: string;
  canEdit: boolean;
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
  id: z.string().uuid(),
  authorId: z.string().uuid(),
  canEditBody: z.boolean().optional().default(false),
  canEditMetadata: z.boolean().optional().default(false),
  kind: z.string(),
  category: z.string().nullable(),
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
  if (d.kind !== 'community' || d.category !== 'dm_table')
    return { ok: true, data: null };
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
      authorId: d.authorId,
      canEdit: d.canEditBody || d.canEditMetadata,
      isPublished: d.status === 'published',
    },
  };
}

/** Load a community/dm_table document by slug when the document resolver returns it. */
export async function loadDmTableBySlug(slug: string): Promise<DmTableView | null> {
  if (!slug) return null;
  try {
    const data = await graphqlRequest<DmTableBySlugQuery>(DM_TABLE_QUERY, {
      slug,
    });
    const result = parseDmTableDocument(data.document);
    if (!result.ok) throw toAppError({ failure: result.failure }, 'profile:dm-table');
    return result.data;
  } catch (err) {
    throw toAppError(err, 'profile:dm-table');
  }
}

const schedulePageSchema = z.object({
  items: z.array(scheduleItemSchema),
  total: z.number().int().nonnegative(),
});
export type DmSchedulePage = { items: DmTableSessionView[]; total: number };
export const DM_SCHEDULE_PAGE_SIZE = 20;
export async function loadDmTableSchedule(
  memberId: string,
  offset = 0,
): Promise<DmSchedulePage> {
  try {
    const data = await graphqlRequest<DmTableScheduleQuery>(SCHEDULE_QUERY, {
      memberId,
      limit: DM_SCHEDULE_PAGE_SIZE,
      offset,
    });
    const parsed = schedulePageSchema.safeParse(data.quests);
    if (!parsed.success)
      throw toAppError({ failure: 'InvalidWire' }, 'profile:schedule');
    return {
      total: parsed.data.total,
      items: parsed.data.items.map((q) => ({
        id: q.id,
        shortCode: q.shortCode,
        title: q.briefDocument?.title ?? q.shortCode,
        scheduledAt: q.scheduledAt,
        status: q.displayStatus ?? q.status,
        slotsMax: q.slotsMax,
        filledCount: q.filledCount,
      })),
    };
  } catch (error) {
    throw toAppError(error, 'profile:schedule');
  }
}
