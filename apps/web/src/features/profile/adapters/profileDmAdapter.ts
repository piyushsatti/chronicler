import { z } from 'zod';
import type { ProfileDmDetailsQuery, QuestArcsPageQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import ARCS from '../../../api/questArcsPage.graphql?raw';
import { toAppError } from '../../../errors/toAppError.js';
import QUERY from './profileDmDetails.graphql?raw';
const arcPage = z.object({
  total: z.number().int().nonnegative(),
  items: z.array(z.object({ id: z.string().uuid(), name: z.string(), createdBy: z.string().uuid(), questCount: z.number().int().nonnegative() })),
});
const schema = z.object({
  questArcs: arcPage,
  dmStats: z.object({ sessionCount: z.number().int().nonnegative() }).nullable(),
  documents: z.object({
    items: z.array(
      z.object({
        id: z.string().uuid(),
        slug: z.string(),
        title: z.string(),
        status: z.string(),
        authorId: z.string().uuid(),
        canEditBody: z.boolean(),
        canEditMetadata: z.boolean(),
      }),
    ),
    total: z.number().int().nonnegative(),
  }),
});
export type ProfileDmDetails = z.infer<typeof schema>;
export const PROFILE_DM_PAGE_SIZE = 20;
export async function loadProfileDmDetails(
  memberId: string,
  offset: number,
  init?: RequestInit,
): Promise<ProfileDmDetails> {
  try {
    const data = await graphqlRequest<ProfileDmDetailsQuery>(QUERY, {
      memberId,
      limit: PROFILE_DM_PAGE_SIZE,
      offset,
    }, init);
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'profile:dm');
    const arcs = [...parsed.data.questArcs.items];
    while (arcs.length < parsed.data.questArcs.total) {
      init?.signal?.throwIfAborted();
      const next = await graphqlRequest<QuestArcsPageQuery>(ARCS, { offset: arcs.length }, init);
      const page = arcPage.safeParse(next.questArcs);
      if (!page.success || page.data.total !== parsed.data.questArcs.total || page.data.items.length === 0)
        throw toAppError({ failure: 'InvalidWire' }, 'profile:series');
      arcs.push(...page.data.items);
    }
    if (arcs.length !== parsed.data.questArcs.total || new Set(arcs.map((arc) => arc.id)).size !== arcs.length)
      throw toAppError({ failure: 'InvalidWire' }, 'profile:series');
    const ownArcs = arcs.filter((arc) => arc.createdBy === memberId);
    return { ...parsed.data, questArcs: { total: ownArcs.length, items: ownArcs } };
  } catch (error) {
    throw toAppError(error, 'profile:dm');
  }
}
