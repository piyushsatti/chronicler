import { z } from 'zod';
import type { ProfileDmDetailsQuery } from '../../../api/graphql.operations.gen.js';
import { graphqlRequest } from '../../../api/graphql.js';
import { toAppError } from '../../../errors/toAppError.js';
import QUERY from './profileDmDetails.graphql?raw';
const schema = z.object({
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
): Promise<ProfileDmDetails> {
  try {
    const data = await graphqlRequest<ProfileDmDetailsQuery>(QUERY, {
      memberId,
      limit: PROFILE_DM_PAGE_SIZE,
      offset,
    });
    const parsed = schema.safeParse(data);
    if (!parsed.success) throw toAppError({ failure: 'InvalidWire' }, 'profile:dm');
    return parsed.data;
  } catch (error) {
    throw toAppError(error, 'profile:dm');
  }
}
