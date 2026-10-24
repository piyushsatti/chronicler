import { z } from 'zod';
import type { DmDashboardQuery, QuestArcsPageQuery } from '../../../api/graphql.operations.gen.js';
import ARCS from '../../../api/questArcsPage.graphql?raw';
import { toAppError } from '../../../errors/toAppError.js';
import { adminRead, type AdminReadRequest } from './adminRequest.js';
import QUERY from './dmDashboard.graphql?raw';
const schema = z.object({
  dmStats: z.object({ sessionCount: z.number().int().nonnegative() }).nullable(),
  questArcs: z.object({
    total: z.number().int().nonnegative(),
    items: z.array(z.object({
      id: z.string().uuid(),
      name: z.string(),
      createdBy: z.string().uuid(),
      questCount: z.number().int().nonnegative(),
    })),
  }),
  quests: z.object({
    total: z.number().int().nonnegative(),
    items: z.array(
      z.object({
        id: z.string().uuid(),
        shortCode: z.string(),
        status: z.string(),
        scheduledAt: z.string().nullable(),
        slotsMax: z.number().int().nonnegative(),
        filledCount: z.number().int().nonnegative(),
        briefDocument: z.object({ title: z.string() }).nullable(),
      }),
    ),
  }),
  documents: z.object({
    total: z.number().int().nonnegative(),
    items: z.array(
      z.object({
        id: z.string().uuid(),
        slug: z.string(),
        title: z.string(),
        status: z.string(),
        authorId: z.string().uuid(),
        canEditMetadata: z.boolean(),
        canEditBody: z.boolean(),
      }),
    ),
  }),
});
export async function loadDmDashboard(
  memberId: string,
  questOffset: number,
  tableOffset: number,
  request: AdminReadRequest,
  questScope: 'page' | 'all' = 'page',
) {
  const data = await adminRead<DmDashboardQuery>(
    QUERY,
    { memberId, questLimit: 25, questOffset, tableLimit: 25, tableOffset },
    request,
  );
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'dm:dashboard');
  const quests = [...parsed.data.quests.items];
  if (questScope === 'all') {
    while (quests.length < parsed.data.quests.total) {
      const next = await adminRead<DmDashboardQuery>(
        QUERY,
        { memberId, questLimit: 25, questOffset: quests.length, tableLimit: 25, tableOffset },
        request,
      );
      const page = schema.shape.quests.safeParse(next.quests);
      if (!page.success || page.data.total !== parsed.data.quests.total || !page.data.items.length)
        throw toAppError({ failure: 'InvalidWire' }, 'dm:quests');
      quests.push(...page.data.items);
    }
    if (quests.length !== parsed.data.quests.total || new Set(quests.map((quest) => quest.id)).size !== quests.length)
      throw toAppError({ failure: 'InvalidWire' }, 'dm:quests');
  }
  const arcs = [...parsed.data.questArcs.items];
  while (arcs.length < parsed.data.questArcs.total) {
    const next = await adminRead<QuestArcsPageQuery>(ARCS, { offset: arcs.length }, request);
    const page = schema.shape.questArcs.safeParse(next.questArcs);
    if (!page.success || page.data.total !== parsed.data.questArcs.total || !page.data.items.length)
      throw toAppError({ failure: 'InvalidWire' }, 'dm:series');
    arcs.push(...page.data.items);
  }
  if (arcs.length !== parsed.data.questArcs.total || new Set(arcs.map((arc) => arc.id)).size !== arcs.length)
    throw toAppError({ failure: 'InvalidWire' }, 'dm:series');
  return { ...parsed.data, quests: { ...parsed.data.quests, items: quests }, series: arcs.filter((arc) => arc.createdBy === memberId) };
}
