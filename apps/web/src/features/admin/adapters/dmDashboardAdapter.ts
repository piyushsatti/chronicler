import { z } from 'zod';
import type { DmDashboardQuery } from '../../../api/graphql.operations.gen.js';
import { toAppError } from '../../../errors/toAppError.js';
import { adminRead, type AdminReadRequest } from './adminRequest.js';
import QUERY from './dmDashboard.graphql?raw';
const schema = z.object({
  dmStats: z.object({ sessionCount: z.number().int().nonnegative() }).nullable(),
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
) {
  const data = await adminRead<DmDashboardQuery>(
    QUERY,
    { memberId, questLimit: 25, questOffset, tableLimit: 25, tableOffset },
    request,
  );
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'dm:dashboard');
  return parsed.data;
}
