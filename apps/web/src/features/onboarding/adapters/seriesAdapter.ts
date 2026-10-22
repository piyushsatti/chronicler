import { z } from 'zod';
import type {
  RetainedSeriesArcQuery,
  RetainedSeriesAuthorityQuery,
  RetainedUpsertArcMutation,
} from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { safeAppError, toAppError } from '../../../errors/toAppError.js';
import ARC from './seriesArc.graphql?raw';
import AUTHORITY from './seriesAuthority.graphql?raw';
import UPSERT from './seriesUpsert.graphql?raw';
import { arcIdSchema } from '../seriesIdentity.js';

const arcSchema = z.object({
  id: arcIdSchema,
  name: z.string().min(1),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
  questCount: z.number().int().nonnegative(),
});
const questSchema = z.object({
  id: z.string().uuid(),
  shortCode: z.string().min(1),
  status: z.string(),
  scheduledAt: z.string().datetime({ offset: true }),
  briefDocument: z.object({ title: z.string() }).nullable(),
});
const pageSchema = arcSchema.extend({ quests: z.array(questSchema) });
export type SeriesView = z.infer<typeof pageSchema>;

export async function loadSeriesArc(id: string): Promise<SeriesView | null> {
  try {
    const first = await graphqlRequest<RetainedSeriesArcQuery>(ARC, { id, offset: 0 });
    if (!first.questArc) return null;
    const header = pageSchema.parse(first.questArc);
    const quests = [...header.quests];
    while (quests.length < header.questCount) {
      const wire = await graphqlRequest<RetainedSeriesArcQuery>(ARC, {
        id,
        offset: quests.length,
      });
      const page = pageSchema.parse(wire.questArc);
      if (
        page.id !== header.id ||
        page.questCount !== header.questCount ||
        page.name !== header.name ||
        page.createdBy !== header.createdBy
      )
        throw safeAppError(
          'This series changed while loading. Try again.',
          'series:changed',
        );
      if (page.quests.length === 0)
        throw toAppError({ failure: 'InvalidWire' }, 'series:page');
      quests.push(...page.quests);
    }
    if (
      quests.length !== header.questCount ||
      new Set(quests.map((quest) => quest.id)).size !== quests.length
    )
      throw safeAppError(
        'This series changed while loading. Try again.',
        'series:changed',
      );
    return { ...header, quests };
  } catch (error) {
    throw toAppError(
      error instanceof z.ZodError ? { failure: 'InvalidWire' } : error,
      'series:read',
    );
  }
}
export async function loadSeriesAuthority(handle: string) {
  try {
    const wire = await graphqlRequest<RetainedSeriesAuthorityQuery>(AUTHORITY, {
      handle,
    });
    const profile = z
      .object({
        member: z.object({
          id: z.string().uuid(),
          roles: z.array(z.string()),
          status: z.string(),
        }),
        dmProfile: z.object({ status: z.string() }).nullable(),
      })
      .parse(wire.memberProfile);
    return {
      memberId: profile.member.id,
      canCreate:
        profile.member.status === 'active' &&
        profile.member.roles.includes('dm') &&
        profile.dmProfile?.status === 'approved',
    };
  } catch (error) {
    throw toAppError(
      error instanceof z.ZodError ? { failure: 'InvalidWire' } : error,
      'series:authority',
    );
  }
}
export async function upsertSeriesArc(
  id: string | null,
  name: string,
  idempotencyKey: string,
) {
  try {
    const wire = await graphqlRequest<RetainedUpsertArcMutation>(UPSERT, {
      id,
      name,
      meta: { idempotencyKey },
    });
    return arcSchema.parse(wire.upsertQuestArc);
  } catch (error) {
    throw toAppError(
      error instanceof z.ZodError ? { failure: 'InvalidWire' } : error,
      'series:write',
    );
  }
}
